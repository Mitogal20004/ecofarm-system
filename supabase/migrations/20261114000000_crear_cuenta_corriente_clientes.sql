begin;

-- Estas columnas pertenecen al módulo de pagos con tarjeta. Se declaran aquí
-- como protección para bases donde esa migración anterior aún no fue aplicada.
alter table public.ventas
  add column if not exists metodo_pago text not null default 'efectivo',
  add column if not exists stripe_payment_intent_id text;

do $bloque_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ventas_metodo_pago_check'
      and conrelid = 'public.ventas'::regclass
  ) then
    alter table public.ventas add constraint ventas_metodo_pago_check
      check (metodo_pago in ('efectivo', 'tarjeta'));
  end if;
end;
$bloque_constraint$;

create unique index if not exists ventas_stripe_payment_intent_id_unico
  on public.ventas (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

insert into public.permisos (codigo, nombre, descripcion)
values
  ('cliente.estado_cuenta', 'Consultar estados de cuenta', 'Consultar el estado de cuenta mensual de un cliente.'),
  ('cliente.abono', 'Registrar abonos', 'Registrar pagos aplicados a la cuenta de un cliente.')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select roles.id, permisos.id
from public.roles
cross join public.permisos
where permisos.codigo in ('cliente.estado_cuenta', 'cliente.abono')
  and roles.nombre in ('Administrador', 'Encargado de ventas')
on conflict do nothing;

create table public.movimientos_cuenta_cliente (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  venta_id uuid references public.ventas(id) on delete restrict,
  tipo varchar(10) not null,
  monto numeric(14, 2) not null,
  metodo_pago varchar(20),
  observaciones varchar(500),
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  fecha timestamptz not null default now(),
  constraint movimientos_cuenta_cliente_pk primary key (id),
  constraint movimientos_cuenta_cliente_tipo_check check (tipo in ('cargo', 'abono')),
  constraint movimientos_cuenta_cliente_monto_check check (monto > 0),
  constraint movimientos_cuenta_cliente_venta_check check (
    (tipo = 'cargo' and venta_id is not null) or (tipo = 'abono' and venta_id is null)
  ),
  constraint movimientos_cuenta_cliente_metodo_check check (
    metodo_pago is null or metodo_pago in ('efectivo', 'tarjeta', 'transferencia')
  )
);

create unique index movimientos_cuenta_cliente_cargo_venta_unico
  on public.movimientos_cuenta_cliente (venta_id) where tipo = 'cargo';
create index movimientos_cuenta_cliente_cliente_fecha
  on public.movimientos_cuenta_cliente (cliente_id, fecha desc, id desc);
alter table public.movimientos_cuenta_cliente enable row level security;

-- Permite que una venta de un cliente quede parcialmente pagada. Las ventas
-- ocasionales siguen bloqueadas por las funciones de confirmación.
alter table public.ventas drop constraint if exists ventas_pago_efectivo_check;
alter table public.ventas add constraint ventas_pago_efectivo_check check (
  (monto_recibido is null and cambio is null)
  or (
    monto_recibido is not null
    and cambio is not null
    and monto_recibido >= 0
    and cambio >= 0
    and cambio = greatest(monto_recibido - total, 0)
  )
);

insert into public.movimientos_cuenta_cliente (cliente_id, venta_id, tipo, monto, metodo_pago, usuario_id, fecha)
select venta.cliente_id, venta.id, 'cargo', venta.total, venta.metodo_pago, venta.usuario_creador, venta.fecha_confirmacion
from public.ventas as venta
where venta.cliente_id is not null and venta.estado = 'confirmada'
on conflict (venta_id) where tipo = 'cargo' do nothing;

insert into public.movimientos_cuenta_cliente (cliente_id, tipo, monto, metodo_pago, observaciones, usuario_id, fecha)
select venta.cliente_id, 'abono', least(venta.monto_recibido, venta.total), venta.metodo_pago,
  'Pago histórico de venta ' || venta.numero, venta.usuario_creador, venta.fecha_confirmacion
from public.ventas as venta
where venta.cliente_id is not null
  and venta.estado = 'confirmada'
  and coalesce(venta.monto_recibido, 0) > 0
on conflict do nothing;

create or replace function public.sincronizar_cuenta_cliente_venta()
returns trigger language plpgsql security definer set search_path = ''
as $funcion$
begin
  if new.cliente_id is not null and new.estado = 'confirmada' and new.monto_recibido is not null then
    insert into public.movimientos_cuenta_cliente
      (cliente_id, venta_id, tipo, monto, metodo_pago, usuario_id, fecha)
    values
      (new.cliente_id, new.id, 'cargo', new.total, new.metodo_pago, new.usuario_creador, new.fecha_confirmacion)
    on conflict (venta_id) where tipo = 'cargo' do nothing;

    if new.monto_recibido > 0 and new.monto_recibido >= new.total then
      insert into public.movimientos_cuenta_cliente
        (cliente_id, tipo, monto, metodo_pago, observaciones, usuario_id, fecha)
      select new.cliente_id, 'abono', least(new.monto_recibido, new.total), new.metodo_pago,
        'Pago de venta ' || new.numero, new.usuario_creador, coalesce(new.fecha_actualizacion, now())
      where not exists (
        select 1 from public.movimientos_cuenta_cliente
        where cliente_id = new.cliente_id and tipo = 'abono'
          and observaciones = 'Pago de venta ' || new.numero
      );
    end if;
  end if;
  return new;
end;
$funcion$;

drop trigger if exists ventas_sincronizar_cuenta_cliente on public.ventas;
create trigger ventas_sincronizar_cuenta_cliente
after insert or update of monto_recibido, cliente_id, estado on public.ventas
for each row execute function public.sincronizar_cuenta_cliente_venta();

create function public.convertir_cotizacion_venta_credito(
  p_cotizacion_id uuid,
  p_monto_recibido numeric,
  p_generar_recibo boolean default true
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_venta public.ventas%rowtype;
begin
  if p_monto_recibido is null or p_monto_recibido < 0
    or round(p_monto_recibido, 2) <> p_monto_recibido
  then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_resultado := public.convertir_cotizacion_venta_sin_pago(p_cotizacion_id, p_generar_recibo);
  select * into v_venta from public.ventas
  where id = (v_resultado #>> '{venta,id}')::uuid for update;

  if v_venta.cliente_id is null or p_monto_recibido >= v_venta.total then
    raise exception using errcode = '23514', message = 'La cotización requiere un cliente registrado y un pago parcial.';
  end if;

  update public.ventas
  set monto_recibido = p_monto_recibido, cambio = 0, metodo_pago = 'efectivo', fecha_actualizacion = now()
  where id = v_venta.id;

  insert into public.movimientos_cuenta_cliente
    (cliente_id, venta_id, tipo, monto, metodo_pago, usuario_id, fecha)
  values (v_venta.cliente_id, v_venta.id, 'cargo', v_venta.total, 'efectivo', auth.uid(), v_venta.fecha_confirmacion)
  on conflict (venta_id) where tipo = 'cargo' do nothing;

  if p_monto_recibido > 0 then
    insert into public.movimientos_cuenta_cliente
      (cliente_id, tipo, monto, metodo_pago, observaciones, usuario_id)
    values (v_venta.cliente_id, 'abono', p_monto_recibido, 'efectivo', 'Pago inicial de venta ' || v_venta.numero, auth.uid());
  end if;

  return jsonb_set(jsonb_set(v_resultado, '{venta,monto_recibido}', to_jsonb(p_monto_recibido), true),
    '{venta,cambio}', '0'::jsonb, true);
end;
$funcion$;

create or replace function public.confirmar_venta_credito(
  p_clave_idempotencia uuid,
  p_cliente_id uuid,
  p_observaciones text,
  p_detalles jsonb,
  p_monto_recibido numeric default 0,
  p_generar_recibo boolean default true
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_venta public.ventas%rowtype;
  v_usuario_id uuid := auth.uid();
  v_pago numeric;
begin
  if p_cliente_id is null or p_monto_recibido is null or p_monto_recibido < 0
    or p_monto_recibido > 999999999999.99
    or round(p_monto_recibido, 2) <> p_monto_recibido
  then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if not public.usuario_actual_tiene_permiso('venta.crear') then
    raise exception using errcode = '42501', message = 'No tiene permiso para realizar esta acción.';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and activo is true) then
    raise exception using errcode = 'P0002', message = 'El cliente solicitado no existe o no está activo.';
  end if;

  v_resultado := public.confirmar_venta_sin_pago(
    p_clave_idempotencia, p_cliente_id, null, null, null,
    p_observaciones, p_detalles, p_generar_recibo
  );

  select * into v_venta
  from public.ventas
  where id = (v_resultado #>> '{venta,id}')::uuid
  for update;

  if p_monto_recibido >= v_venta.total then
    raise exception using errcode = '23514', message = 'Use el flujo de venta pagada para este monto.';
  end if;

  v_pago := p_monto_recibido;
  update public.ventas
  set monto_recibido = v_pago, cambio = 0, metodo_pago = 'efectivo', fecha_actualizacion = now()
  where id = v_venta.id;

  insert into public.movimientos_cuenta_cliente
    (cliente_id, venta_id, tipo, monto, metodo_pago, usuario_id, fecha)
  values
    (v_venta.cliente_id, v_venta.id, 'cargo', v_venta.total, 'efectivo', v_usuario_id, v_venta.fecha_confirmacion)
  on conflict (venta_id) where tipo = 'cargo' do nothing;

  if v_pago > 0 then
    insert into public.movimientos_cuenta_cliente
      (cliente_id, tipo, monto, metodo_pago, observaciones, usuario_id)
    values
      (v_venta.cliente_id, 'abono', v_pago, 'efectivo', 'Pago inicial de venta ' || v_venta.numero, v_usuario_id);
  end if;

  return jsonb_set(jsonb_set(v_resultado, '{venta,monto_recibido}', to_jsonb(v_pago), true),
    '{venta,cambio}', '0'::jsonb, true);
end;
$funcion$;

create function public.obtener_estado_cuenta_cliente(p_cliente_id uuid, p_mes date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $funcion$
declare
  v_inicio date := coalesce(date_trunc('month', p_mes)::date, date_trunc('month', current_date)::date);
  v_fin date := (v_inicio + interval '1 month')::date;
  v_saldo numeric;
begin
  if not public.usuario_actual_tiene_permiso('cliente.estado_cuenta') then
    raise exception using errcode = '42501', message = 'No tiene permiso para realizar esta acción.';
  end if;
  if p_cliente_id is null or not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception using errcode = 'P0002', message = 'El cliente solicitado no existe.';
  end if;
  select coalesce(sum(case when tipo = 'cargo' then monto else -monto end), 0)
    into v_saldo
  from public.movimientos_cuenta_cliente
  where cliente_id = p_cliente_id;
  return jsonb_build_object(
    'saldo', v_saldo,
    'mes', v_inicio,
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', movimiento.id, 'tipo', movimiento.tipo, 'monto', movimiento.monto,
        'metodo_pago', movimiento.metodo_pago, 'observaciones', movimiento.observaciones,
        'fecha', movimiento.fecha, 'venta_id', movimiento.venta_id
      ) order by movimiento.fecha, movimiento.id)
      from public.movimientos_cuenta_cliente as movimiento
      where movimiento.cliente_id = p_cliente_id
        and movimiento.fecha >= v_inicio and movimiento.fecha < v_fin
    ), '[]'::jsonb)
  );
end;
$funcion$;

create function public.registrar_abono_cliente(
  p_cliente_id uuid, p_monto numeric, p_metodo_pago text, p_observaciones text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $funcion$
declare
  v_saldo numeric;
  v_usuario uuid := auth.uid();
  v_id uuid;
begin
  if not public.usuario_actual_tiene_permiso('cliente.abono') then
    raise exception using errcode = '42501', message = 'No tiene permiso para realizar esta acción.';
  end if;
  if p_monto is null or p_monto <= 0 or round(p_monto, 2) <> p_monto
    or p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia')
  then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;
  perform 1 from public.clientes where id = p_cliente_id and activo is true for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'El cliente solicitado no existe o no está activo.';
  end if;
  select coalesce(sum(case when tipo = 'cargo' then monto else -monto end), 0)
    into v_saldo
  from public.movimientos_cuenta_cliente
  where cliente_id = p_cliente_id;
  if p_monto > v_saldo then
    raise exception using errcode = '23514', message = 'El abono no puede superar el saldo pendiente.';
  end if;
  insert into public.movimientos_cuenta_cliente
    (cliente_id, tipo, monto, metodo_pago, observaciones, usuario_id)
  values (p_cliente_id, 'abono', p_monto, p_metodo_pago, nullif(btrim(p_observaciones), ''), v_usuario)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'monto', p_monto, 'saldo', v_saldo - p_monto);
end;
$funcion$;

revoke execute on function public.confirmar_venta_credito(uuid, uuid, text, jsonb, numeric, boolean) from public, anon, service_role;
grant execute on function public.confirmar_venta_credito(uuid, uuid, text, jsonb, numeric, boolean) to authenticated;
revoke execute on function public.convertir_cotizacion_venta_credito(uuid, numeric, boolean) from public, anon, service_role;
grant execute on function public.convertir_cotizacion_venta_credito(uuid, numeric, boolean) to authenticated;
revoke execute on function public.obtener_estado_cuenta_cliente(uuid, date), public.registrar_abono_cliente(uuid, numeric, text, text) from public, anon, service_role;
grant execute on function public.obtener_estado_cuenta_cliente(uuid, date), public.registrar_abono_cliente(uuid, numeric, text, text) to authenticated;

commit;
