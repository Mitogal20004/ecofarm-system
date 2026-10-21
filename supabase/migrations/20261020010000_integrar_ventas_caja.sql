begin;

-- Ventas admite totales de Q 0.00. Para conservar ese comportamiento y
-- registrar exactamente ventas.total, una Venta puede producir un movimiento
-- neutro; una devolucion_venta sigue exigiendo una variacion negativa.
alter table public.caja_movimientos
  drop constraint caja_movimientos_variacion_check;

alter table public.caja_movimientos
  add constraint caja_movimientos_variacion_check
    check (
      (tipo = 'venta' and variacion_efectivo >= 0)
      or (
        tipo = 'devolucion_venta'
        and variacion_efectivo < 0
      )
    );


-- Helper interno para registrar el efectivo de una Venta en el turno que la
-- operacion publica bloqueo antes de iniciar la confirmacion. La consulta del
-- movimiento existente permite reintentos internos sin exigir que la caja
-- continue abierta, pero nunca reasigna una Venta a otro turno.
create function public.registrar_movimiento_caja_venta(
  p_caja_turno_id uuid,
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
  v_turno public.caja_turnos%rowtype;
  v_venta public.ventas%rowtype;
  v_movimiento public.caja_movimientos%rowtype;
begin
  if p_caja_turno_id is null
    or p_venta_id is null
    or p_usuario_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  select movimiento.*
  into v_movimiento
  from public.caja_movimientos as movimiento
  where movimiento.venta_id = p_venta_id
    and movimiento.tipo = 'venta';

  if found then
    select venta.*
    into v_venta
    from public.ventas as venta
    where venta.id = p_venta_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'La Venta solicitada no existe.';
    end if;

    if v_movimiento.caja_turno_id <> p_caja_turno_id
      or v_movimiento.usuario_id <> p_usuario_id
      or v_movimiento.variacion_efectivo <> v_venta.total
    then
      raise exception using
        errcode = '23505',
        message = 'La Venta ya tiene un movimiento de caja diferente.';
    end if;

    return;
  end if;

  -- cerrar_caja bloquea esta misma fila. Si el cierre obtuvo primero el lock,
  -- la operacion observa estado cerrada y no puede insertar el movimiento.
  select turno.*
  into v_turno
  from public.caja_turnos as turno
  where turno.id = p_caja_turno_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La caja solicitada no existe.';
  end if;

  if v_turno.usuario_responsable <> p_usuario_id
    or v_turno.estado <> 'abierta'
  then
    raise exception using
      errcode = '23514',
      message = 'La Venta no puede registrarse en la caja indicada.';
  end if;

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  if v_venta.usuario_creador <> p_usuario_id
    or v_venta.estado <> 'confirmada'
    or v_venta.monto_recibido is null
    or v_venta.cambio is null
    or v_venta.fecha_confirmacion < v_turno.fecha_apertura
  then
    raise exception using
      errcode = '23514',
      message = 'La Venta no puede registrarse como ingreso de esta caja.';
  end if;

  insert into public.caja_movimientos (
    caja_turno_id,
    venta_id,
    tipo,
    variacion_efectivo,
    usuario_id
  )
  values (
    p_caja_turno_id,
    p_venta_id,
    'venta',
    v_venta.total,
    p_usuario_id
  )
  on conflict on constraint caja_movimientos_venta_tipo_unico do nothing
  returning * into v_movimiento;

  if not found then
    select movimiento.*
    into v_movimiento
    from public.caja_movimientos as movimiento
    where movimiento.venta_id = p_venta_id
      and movimiento.tipo = 'venta';

    if not found
      or v_movimiento.caja_turno_id <> p_caja_turno_id
      or v_movimiento.usuario_id <> p_usuario_id
      or v_movimiento.variacion_efectivo <> v_venta.total
    then
      raise exception using
        errcode = '23505',
        message = 'La Venta ya tiene un movimiento de caja diferente.';
    end if;
  end if;
end;
$funcion$;

revoke execute
  on function public.registrar_movimiento_caja_venta(uuid, uuid, uuid)
  from public;
revoke execute
  on function public.registrar_movimiento_caja_venta(uuid, uuid, uuid)
  from anon;
revoke execute
  on function public.registrar_movimiento_caja_venta(uuid, uuid, uuid)
  from authenticated;
revoke execute
  on function public.registrar_movimiento_caja_venta(uuid, uuid, uuid)
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

  -- Este lock fija el turno de la operacion y se conserva hasta que la Venta,
  -- Inventario, Recibo, pago y movimiento de caja confirmen juntos.
  select turno.id
  into v_caja_turno_id
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta'
  for update;

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

    if v_caja_turno_id is not null then
      perform public.registrar_movimiento_caja_venta(
        v_caja_turno_id,
        v_venta.id,
        v_usuario_id
      );
    end if;
  end if;

  -- Un reintento devuelve el pago persistido y no intenta asociar la Venta a
  -- una caja nueva ni requiere que el turno original continue abierto.
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

  select turno.id
  into v_caja_turno_id
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta'
  for update;

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

  if v_caja_turno_id is not null then
    perform public.registrar_movimiento_caja_venta(
      v_caja_turno_id,
      v_venta.id,
      v_usuario_id
    );
  end if;

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

-- anular_venta no se modifica: reintegrar Inventario no demuestra que haya
-- ocurrido una devolucion fisica de efectivo. Esa operacion requerira una RPC
-- explicita y nunca podra reescribir el snapshot de un turno ya cerrado.

commit;
