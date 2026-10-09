begin;

-- El pago pertenece a la Venta para que cualquier Recibo actual o reimpreso
-- represente el mismo efectivo recibido. Las filas históricas permanecen NULL.
alter table public.ventas
  add column monto_recibido numeric(14, 2),
  add column cambio numeric(14, 2),
  add constraint ventas_pago_efectivo_check
    check (
      (
        monto_recibido is null
        and cambio is null
      )
      or (
        monto_recibido is not null
        and cambio is not null
        and monto_recibido >= total
        and cambio = monto_recibido - total
      )
    );

-- Las implementaciones originales ya contienen la transacción de Venta,
-- detalles, locks, Inventario, movimientos, Recibo e idempotencia. Se
-- conservan como helpers internos y se revoca su exposición por PostgREST.
alter function public.confirmar_venta(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  boolean
)
rename to confirmar_venta_sin_pago;

revoke execute
  on function public.confirmar_venta_sin_pago(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from public;
revoke execute
  on function public.confirmar_venta_sin_pago(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from anon;
revoke execute
  on function public.confirmar_venta_sin_pago(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from authenticated;
revoke execute
  on function public.confirmar_venta_sin_pago(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from service_role;


create or replace function public.confirmar_venta(
  p_clave_idempotencia uuid,
  p_cliente_id uuid,
  p_comprador_nombre text,
  p_comprador_nit text,
  p_comprador_direccion text,
  p_observaciones text,
  p_detalles jsonb,
  p_monto_recibido numeric,
  p_generar_recibo boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_venta public.ventas%rowtype;
  v_es_nueva boolean;
begin
  if p_monto_recibido is null
    or p_monto_recibido <= 0
    or p_monto_recibido > 999999999999.99
    or round(p_monto_recibido, 2) <> p_monto_recibido
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_resultado := public.confirmar_venta_sin_pago(
    p_clave_idempotencia,
    p_cliente_id,
    p_comprador_nombre,
    p_comprador_nit,
    p_comprador_direccion,
    p_observaciones,
    p_detalles,
    p_generar_recibo
  );

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = (v_resultado #>> '{venta,id}')::uuid
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  v_es_nueva := coalesce((v_resultado ->> 'cambio')::boolean, false);

  if v_es_nueva then
    if p_monto_recibido < v_venta.total then
      raise exception using
        errcode = '23514',
        message = 'El monto recibido es insuficiente para completar la Venta.';
    end if;

    update public.ventas as venta
    set
      monto_recibido = p_monto_recibido,
      cambio = p_monto_recibido - venta.total,
      fecha_actualizacion = now()
    where venta.id = v_venta.id
    returning venta.* into v_venta;
  end if;

  -- Un reintento idempotente siempre devuelve el pago ya persistido. El valor
  -- recibido en el reintento nunca puede modificar la Venta existente.
  v_resultado := jsonb_set(
    v_resultado,
    '{venta,monto_recibido}',
    coalesce(to_jsonb(v_venta.monto_recibido), 'null'::jsonb),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{venta,cambio}',
    coalesce(to_jsonb(v_venta.cambio), 'null'::jsonb),
    true
  );

  return v_resultado;
end;
$funcion$;

revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    numeric,
    boolean
  )
  from public;
revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    numeric,
    boolean
  )
  from anon;
revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    numeric,
    boolean
  )
  from service_role;
grant execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    numeric,
    boolean
  )
  to authenticated;


alter function public.convertir_cotizacion_venta(uuid, boolean)
rename to convertir_cotizacion_venta_sin_pago;

revoke execute
  on function public.convertir_cotizacion_venta_sin_pago(uuid, boolean)
  from public;
revoke execute
  on function public.convertir_cotizacion_venta_sin_pago(uuid, boolean)
  from anon;
revoke execute
  on function public.convertir_cotizacion_venta_sin_pago(uuid, boolean)
  from authenticated;
revoke execute
  on function public.convertir_cotizacion_venta_sin_pago(uuid, boolean)
  from service_role;


create or replace function public.convertir_cotizacion_venta(
  p_cotizacion_id uuid,
  p_monto_recibido numeric,
  p_generar_recibo boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_venta public.ventas%rowtype;
begin
  if p_monto_recibido is null
    or p_monto_recibido <= 0
    or p_monto_recibido > 999999999999.99
    or round(p_monto_recibido, 2) <> p_monto_recibido
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_resultado := public.convertir_cotizacion_venta_sin_pago(
    p_cotizacion_id,
    p_generar_recibo
  );

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = (v_resultado #>> '{venta,id}')::uuid
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  if p_monto_recibido < v_venta.total then
    raise exception using
      errcode = '23514',
      message = 'El monto recibido es insuficiente para completar la Venta.';
  end if;

  update public.ventas as venta
  set
    monto_recibido = p_monto_recibido,
    cambio = p_monto_recibido - venta.total,
    fecha_actualizacion = now()
  where venta.id = v_venta.id
  returning venta.* into v_venta;

  v_resultado := jsonb_set(
    v_resultado,
    '{venta,monto_recibido}',
    to_jsonb(v_venta.monto_recibido),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{venta,cambio}',
    to_jsonb(v_venta.cambio),
    true
  );

  return v_resultado;
end;
$funcion$;

revoke execute
  on function public.convertir_cotizacion_venta(uuid, numeric, boolean)
  from public;
revoke execute
  on function public.convertir_cotizacion_venta(uuid, numeric, boolean)
  from anon;
revoke execute
  on function public.convertir_cotizacion_venta(uuid, numeric, boolean)
  from service_role;
grant execute
  on function public.convertir_cotizacion_venta(uuid, numeric, boolean)
  to authenticated;


-- Obtener la Venta sigue siendo la fuente para mostrar o reimprimir cualquier
-- Recibo. Se amplía su resultado sin duplicar el pago en public.recibos.
alter function public.obtener_venta(uuid)
rename to obtener_venta_sin_pago;

revoke execute on function public.obtener_venta_sin_pago(uuid)
  from public;
revoke execute on function public.obtener_venta_sin_pago(uuid)
  from anon;
revoke execute on function public.obtener_venta_sin_pago(uuid)
  from authenticated;
revoke execute on function public.obtener_venta_sin_pago(uuid)
  from service_role;


create or replace function public.obtener_venta(
  p_venta_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_monto_recibido numeric(14, 2);
  v_cambio numeric(14, 2);
begin
  v_resultado := public.obtener_venta_sin_pago(p_venta_id);

  select
    venta.monto_recibido,
    venta.cambio
  into
    v_monto_recibido,
    v_cambio
  from public.ventas as venta
  where venta.id = p_venta_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  v_resultado := jsonb_set(
    v_resultado,
    '{venta,monto_recibido}',
    coalesce(to_jsonb(v_monto_recibido), 'null'::jsonb),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{venta,cambio}',
    coalesce(to_jsonb(v_cambio), 'null'::jsonb),
    true
  );

  return v_resultado;
end;
$funcion$;

revoke execute on function public.obtener_venta(uuid)
  from public;
revoke execute on function public.obtener_venta(uuid)
  from anon;
revoke execute on function public.obtener_venta(uuid)
  from service_role;
grant execute on function public.obtener_venta(uuid)
  to authenticated;

commit;
