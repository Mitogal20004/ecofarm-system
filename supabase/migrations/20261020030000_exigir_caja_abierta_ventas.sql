begin;

-- Las operaciones nuevas de venta en efectivo requieren el turno abierto del
-- usuario autenticado. Un reintento idempotente de una venta directa ya
-- confirmada conserva su respuesta original aunque el turno haya cerrado.
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
  v_usuario_id uuid;
  v_caja_turno_id uuid;
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
      message = 'Los parametros proporcionados no son validos.';
  end if;

  if not public.usuario_actual_tiene_permiso('venta.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  if p_clave_idempotencia is null then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  -- Serializa el prechequeo con el helper original. Si la clave ya produjo
  -- una Venta, la llamada es solo una consulta idempotente y no necesita un
  -- turno nuevo. Para una operacion nueva, la Caja se bloquea antes de crear
  -- la Venta o descontar Inventario.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_clave_idempotencia::text, 0)
  );

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.clave_idempotencia = p_clave_idempotencia;

  if not found then
    select turno.id
    into v_caja_turno_id
    from public.caja_turnos as turno
    where turno.usuario_responsable = v_usuario_id
      and turno.estado = 'abierta'
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'Debes abrir Caja antes de confirmar una venta.';
    end if;
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

    perform public.registrar_movimiento_caja_venta(
      v_caja_turno_id,
      v_venta.id,
      v_usuario_id
    );
  end if;

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
  v_usuario_id uuid;
  v_caja_turno_id uuid;
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
      message = 'Los parametros proporcionados no son validos.';
  end if;

  if not public.usuario_actual_tiene_permiso('cotizacion.convertir') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  -- La misma fila es bloqueada por cerrar_caja. El turno pertenece siempre
  -- al usuario autenticado y permanece abierto durante toda la conversion.
  select turno.id
  into v_caja_turno_id
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta'
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Debes abrir Caja antes de confirmar una venta.';
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

  perform public.registrar_movimiento_caja_venta(
    v_caja_turno_id,
    v_venta.id,
    v_usuario_id
  );

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

commit;
