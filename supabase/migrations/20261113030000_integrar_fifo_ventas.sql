begin;

create table public.venta_lote_consumos (
  id uuid not null default gen_random_uuid(),
  venta_id uuid not null,
  venta_detalle_id uuid not null,
  lote_id uuid not null,
  cantidad integer not null,
  costo_unitario numeric(14,4) not null,
  fecha_consumo timestamptz not null default now(),
  constraint venta_lote_consumos_pk primary key (id),
  constraint venta_lote_consumos_cantidad_check check (cantidad > 0 and costo_unitario >= 0),
  constraint venta_lote_consumos_venta_fk foreign key (venta_id) references public.ventas (id) on delete restrict,
  constraint venta_lote_consumos_detalle_fk foreign key (venta_detalle_id) references public.venta_detalles (id) on delete restrict,
  constraint venta_lote_consumos_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict,
  constraint venta_lote_consumos_unico unique (venta_detalle_id, lote_id)
);

create index venta_lote_consumos_venta_idx
  on public.venta_lote_consumos (venta_id, venta_detalle_id);
create index venta_lote_consumos_lote_idx
  on public.venta_lote_consumos (lote_id, fecha_consumo);

alter table public.venta_lote_consumos enable row level security;
revoke all on table public.venta_lote_consumos from public, anon, authenticated;

create or replace function public.descontar_inventario_venta(
  p_venta_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_detalle record;
  v_lote public.lotes%rowtype;
  v_existencia public.inventario_existencias%rowtype;
  v_disponible bigint;
  v_requerido bigint;
  v_lotes_total bigint;
  v_consumir integer;
  v_numero_venta text;
begin
  if p_venta_id is null or p_usuario_id is null then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select venta.numero into v_numero_venta
  from public.ventas as venta
  where venta.id = p_venta_id;

  if not found or not exists (select 1 from public.venta_detalles where venta_id = p_venta_id) then
    raise exception using errcode = '23514', message = 'La Venta no tiene un detalle válido.';
  end if;

  -- El orden de bloqueo de variantes es estable para evitar deadlocks entre
  -- dos cajas que confirman ventas simultáneamente.
  perform variante.id
  from public.producto_variantes as variante
  where exists (
    select 1 from public.venta_detalles detalle
    where detalle.venta_id = p_venta_id and detalle.variante_id = variante.id
  )
  order by variante.id
  for no key update of variante;

  -- Validar primero toda la venta. Si existe al menos un lote para la variante,
  -- la venta debe tener suficiente saldo liberado en lotes; no se mezcla con
  -- stock antiguo para evitar una trazabilidad falsa.
  for v_detalle in
    select variante_id, sum(cantidad_manojos)::bigint as cantidad_manojos
    from public.venta_detalles
    where venta_id = p_venta_id
    group by variante_id
    order by variante_id
  loop
    select
      coalesce(sum(case when lote.estado = 'liberado' then lote.cantidad_disponible else 0 end), 0),
      count(*)
    into v_disponible, v_lotes_total
    from public.lotes lote
    where lote.variante_id = v_detalle.variante_id;

    if v_lotes_total > 0 and v_disponible < v_detalle.cantidad_manojos then
      raise exception using errcode = '23514', message = 'No hay lotes liberados suficientes para completar la Venta.';
    end if;

    if v_lotes_total = 0 then
      insert into public.inventario_existencias (variante_id)
      values (v_detalle.variante_id)
      on conflict (variante_id) do nothing;

      select existencia.* into v_existencia
      from public.inventario_existencias existencia
      where existencia.variante_id = v_detalle.variante_id
      for update;

      if not found or v_detalle.cantidad_manojos > v_existencia.stock_manojos then
        raise exception using errcode = '23514', message = 'No hay stock suficiente para completar la Venta.';
      end if;
    end if;
  end loop;

  for v_detalle in
    select id, venta_id, variante_id, cantidad_manojos
    from public.venta_detalles
    where venta_id = p_venta_id
    order by numero_linea
  loop
    v_requerido := v_detalle.cantidad_manojos;

    for v_lote in
      select lote.*
      from public.lotes lote
      where lote.variante_id = v_detalle.variante_id
        and lote.estado = 'liberado'
        and lote.cantidad_disponible > 0
      order by lote.fecha_origen, lote.fecha_creacion, lote.id
      for update
    loop
      exit when v_requerido = 0;
      v_consumir := least(v_requerido, v_lote.cantidad_disponible);

      update public.lotes
      set cantidad_disponible = cantidad_disponible - v_consumir,
          estado = case when cantidad_disponible - v_consumir = 0 then 'agotado' else estado end,
          fecha_actualizacion = now()
      where id = v_lote.id;

      insert into public.venta_lote_consumos (venta_id, venta_detalle_id, lote_id, cantidad, costo_unitario)
      values (p_venta_id, v_detalle.id, v_lote.id, v_consumir, v_lote.costo_unitario);

      insert into public.movimientos_lotes (
        lote_id, tipo, cantidad, saldo_anterior, saldo_posterior,
        referencia_tipo, referencia_id, motivo, usuario_id
      ) values (
        v_lote.id, 'salida', v_consumir, v_lote.cantidad_disponible,
        v_lote.cantidad_disponible - v_consumir, 'venta', p_venta_id,
        'Venta ' || v_numero_venta, p_usuario_id
      );

      v_requerido := v_requerido - v_consumir;
    end loop;

    if v_requerido > 0 then
      -- Compatibilidad temporal para variantes que aún no tienen lotes.
      select existencia.* into v_existencia
      from public.inventario_existencias existencia
      where existencia.variante_id = v_detalle.variante_id
      for update;

      update public.inventario_existencias
      set stock_manojos = stock_manojos - v_requerido::integer,
          fecha_actualizacion = now()
      where variante_id = v_detalle.variante_id;

      insert into public.movimientos_inventario (
        variante_id, tipo, variacion_manojos, saldo_anterior, saldo_posterior,
        motivo, origen, referencia_id, usuario_id
      ) values (
        v_detalle.variante_id, 'salida', -v_requerido::integer,
        v_existencia.stock_manojos, v_existencia.stock_manojos - v_requerido::integer,
        'Venta ' || v_numero_venta, 'venta', p_venta_id, p_usuario_id
      );
    end if;
  end loop;
end;
$funcion$;

create or replace function public.listar_consumos_lote_venta(p_venta_id uuid)
returns table (
  venta_detalle_id uuid,
  lote_id uuid,
  codigo_lote varchar(50),
  fecha_origen date,
  calidad varchar(30),
  cantidad integer,
  costo_unitario numeric(14,4),
  fecha_consumo timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
begin
  if p_venta_id is null or not public.usuario_actual_tiene_permiso('venta.ver') then
    raise exception using errcode = '42501', message = 'No tiene permiso para realizar esta acción.';
  end if;

  return query
  select consumo.venta_detalle_id, consumo.lote_id, lote.codigo,
    lote.fecha_origen, lote.calidad, consumo.cantidad,
    consumo.costo_unitario, consumo.fecha_consumo
  from public.venta_lote_consumos consumo
  join public.lotes lote on lote.id = consumo.lote_id
  where consumo.venta_id = p_venta_id
  order by consumo.venta_detalle_id, lote.fecha_origen, lote.id;
end;
$funcion$;

revoke all on function public.listar_consumos_lote_venta(uuid) from public, anon, service_role;
grant execute on function public.listar_consumos_lote_venta(uuid) to authenticated;

commit;
