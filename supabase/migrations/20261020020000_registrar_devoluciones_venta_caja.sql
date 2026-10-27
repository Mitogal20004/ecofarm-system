begin;

-- La anulacion comercial y la entrega fisica de efectivo son operaciones
-- independientes. Este permiso autoriza exclusivamente la segunda.
insert into public.permisos (
  codigo,
  nombre,
  descripcion
)
values (
  'caja.registrar_devolucion',
  'Registrar devoluciones de caja',
  'Registrar la devolucion completa de efectivo de una Venta anulada.'
)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  activo = true,
  fecha_actualizacion = now();

do $validacion_roles$
begin
  if (
    select count(*)
    from public.roles as rol
    where rol.nombre in ('Administrador', 'Jefe')
  ) <> 2 then
    raise exception using
      errcode = 'P0002',
      message = 'No se encontraron los roles requeridos para configurar devoluciones de Caja.';
  end if;

  if not exists (
    select 1
    from public.permisos as permiso
    where permiso.codigo = 'caja.registrar_devolucion'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'No se pudo configurar el permiso de devoluciones de Caja.';
  end if;
end;
$validacion_roles$;

insert into public.roles_permisos (
  rol_id,
  permiso_id
)
select
  rol.id,
  permiso.id
from public.roles as rol
cross join public.permisos as permiso
where rol.nombre in ('Administrador', 'Jefe')
  and permiso.codigo = 'caja.registrar_devolucion'
on conflict (rol_id, permiso_id) do nothing;

do $validacion_asignaciones$
begin
  if (
    select count(*)
    from public.roles_permisos as rol_permiso
    join public.roles as rol
      on rol.id = rol_permiso.rol_id
    join public.permisos as permiso
      on permiso.id = rol_permiso.permiso_id
    where permiso.codigo = 'caja.registrar_devolucion'
      and rol.nombre in ('Administrador', 'Jefe')
  ) <> 2
    or exists (
      select 1
      from public.roles_permisos as rol_permiso
      join public.roles as rol
        on rol.id = rol_permiso.rol_id
      join public.permisos as permiso
        on permiso.id = rol_permiso.permiso_id
      where permiso.codigo = 'caja.registrar_devolucion'
        and rol.nombre not in ('Administrador', 'Jefe')
    )
  then
    raise exception using
      errcode = '23514',
      message = 'El permiso de devoluciones de Caja no tiene las asignaciones esperadas.';
  end if;
end;
$validacion_asignaciones$;


-- Las ventas ya registradas permanecen con NULL. Toda devolucion nueva debe
-- conservar la clave de la operacion para poder resolver reintentos inciertos.
alter table public.caja_movimientos
  add column clave_idempotencia uuid;

do $validacion_devoluciones_existentes$
begin
  if exists (
    select 1
    from public.caja_movimientos as movimiento
    where movimiento.tipo = 'devolucion_venta'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existen devoluciones de Caja sin clave de idempotencia. Revise los datos antes de aplicar la migracion.';
  end if;
end;
$validacion_devoluciones_existentes$;

alter table public.caja_movimientos
  add constraint caja_movimientos_clave_segun_tipo_check
    check (
      (tipo = 'venta' and clave_idempotencia is null)
      or (
        tipo = 'devolucion_venta'
        and clave_idempotencia is not null
      )
    );

create unique index caja_movimientos_clave_devolucion_unica
  on public.caja_movimientos (clave_idempotencia)
  where tipo = 'devolucion_venta';


-- Registra la salida en la caja abierta del usuario que entrega el efectivo.
-- La caja nunca se recibe como parametro y el importe siempre deriva de la
-- Venta persistida. La unicidad existente (venta_id, tipo) constituye una
-- segunda barrera contra devoluciones duplicadas.
create function public.registrar_devolucion_venta(
  p_venta_id uuid,
  p_clave_idempotencia uuid,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_motivo text;
  v_turno public.caja_turnos%rowtype;
  v_venta public.ventas%rowtype;
  v_movimiento_original public.caja_movimientos%rowtype;
  v_devolucion public.caja_movimientos%rowtype;
  v_estado_factura public.facturas_fel.estado%type;
  v_efectivo_disponible numeric;
begin
  if not public.usuario_actual_tiene_permiso(
    'caja.registrar_devolucion'
  )
    or not public.usuario_actual_tiene_permiso('caja.operar')
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_venta_id is null
    or p_clave_idempotencia is null
    or v_motivo is null
    or char_length(v_motivo) > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  perform 1
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  -- Este atajo permite resolver un reintento despues de que la caja usada en
  -- la operacion original haya sido cerrada. Los datos deben coincidir.
  select movimiento.*
  into v_devolucion
  from public.caja_movimientos as movimiento
  where movimiento.clave_idempotencia = p_clave_idempotencia
    and movimiento.tipo = 'devolucion_venta';

  if found then
    if v_devolucion.venta_id <> p_venta_id
      or v_devolucion.usuario_id <> v_usuario_id
      or v_devolucion.motivo <> v_motivo
    then
      raise exception using
        errcode = '23505',
        message = 'La clave de idempotencia ya fue utilizada.';
    end if;

    return jsonb_build_object(
      'cambio', false,
      'devolucion', jsonb_build_object(
        'id', v_devolucion.id,
        'venta_id', v_devolucion.venta_id,
        'caja_turno_id', v_devolucion.caja_turno_id,
        'importe_devuelto', -v_devolucion.variacion_efectivo,
        'variacion_efectivo', v_devolucion.variacion_efectivo,
        'usuario_id', v_devolucion.usuario_id,
        'motivo', v_devolucion.motivo,
        'fecha_movimiento', v_devolucion.fecha_movimiento
      )
    );
  end if;

  -- cerrar_caja y los movimientos de Venta bloquean primero esta misma fila.
  -- Por ello una devolucion queda completamente antes del cierre o se rechaza.
  select turno.*
  into v_turno
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta'
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'El usuario no tiene una caja abierta para registrar la devolucion.';
  end if;

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  -- Revalidar bajo los locks resuelve dos solicitudes concurrentes con la
  -- misma clave o para la misma Venta sin depender del orden de llegada.
  select movimiento.*
  into v_devolucion
  from public.caja_movimientos as movimiento
  where movimiento.clave_idempotencia = p_clave_idempotencia
    and movimiento.tipo = 'devolucion_venta';

  if found then
    if v_devolucion.venta_id <> p_venta_id
      or v_devolucion.usuario_id <> v_usuario_id
      or v_devolucion.motivo <> v_motivo
    then
      raise exception using
        errcode = '23505',
        message = 'La clave de idempotencia ya fue utilizada.';
    end if;

    return jsonb_build_object(
      'cambio', false,
      'devolucion', jsonb_build_object(
        'id', v_devolucion.id,
        'venta_id', v_devolucion.venta_id,
        'caja_turno_id', v_devolucion.caja_turno_id,
        'importe_devuelto', -v_devolucion.variacion_efectivo,
        'variacion_efectivo', v_devolucion.variacion_efectivo,
        'usuario_id', v_devolucion.usuario_id,
        'motivo', v_devolucion.motivo,
        'fecha_movimiento', v_devolucion.fecha_movimiento
      )
    );
  end if;

  if v_venta.estado <> 'anulada' then
    raise exception using
      errcode = '23514',
      message = 'La Venta debe estar anulada antes de registrar la devolucion.';
  end if;

  if v_venta.total <= 0 then
    raise exception using
      errcode = '23514',
      message = 'La Venta no tiene un importe de efectivo que devolver.';
  end if;

  select movimiento.*
  into v_devolucion
  from public.caja_movimientos as movimiento
  where movimiento.venta_id = p_venta_id
    and movimiento.tipo = 'devolucion_venta';

  if found then
    raise exception using
      errcode = '23505',
      message = 'La Venta ya tiene una devolucion de efectivo registrada.';
  end if;

  select movimiento.*
  into v_movimiento_original
  from public.caja_movimientos as movimiento
  where movimiento.venta_id = p_venta_id
    and movimiento.tipo = 'venta';

  if not found
    or v_movimiento_original.variacion_efectivo <> v_venta.total
  then
    raise exception using
      errcode = '23514',
      message = 'La Venta no tiene un ingreso de Caja valido para devolver.';
  end if;

  select
    v_turno.fondo_inicial
      + coalesce(sum(movimiento.variacion_efectivo), 0::numeric)
  into v_efectivo_disponible
  from public.caja_movimientos as movimiento
  where movimiento.caja_turno_id = v_turno.id;

  if v_efectivo_disponible < v_venta.total then
    raise exception using
      errcode = '23514',
      message = 'La caja abierta no tiene suficiente efectivo esperado para registrar la devolucion.';
  end if;

  -- Se bloquea cualquier documento FEL asociado durante la decision. Solo un
  -- documento fiscal ya anulado permite continuar; pendiente, procesando o
  -- con error podria certificarse posteriormente y por seguridad se rechaza.
  select factura.estado
  into v_estado_factura
  from public.facturas_fel as factura
  where factura.venta_id = p_venta_id
  for update;

  if found and v_estado_factura <> 'anulada' then
    raise exception using
      errcode = '23514',
      message = 'Debe resolver el documento FEL asociado antes de registrar la devolucion.';
  end if;

  insert into public.caja_movimientos (
    caja_turno_id,
    venta_id,
    tipo,
    variacion_efectivo,
    usuario_id,
    motivo,
    clave_idempotencia
  )
  values (
    v_turno.id,
    v_venta.id,
    'devolucion_venta',
    -v_venta.total,
    v_usuario_id,
    v_motivo,
    p_clave_idempotencia
  )
  returning * into v_devolucion;

  return jsonb_build_object(
    'cambio', true,
    'devolucion', jsonb_build_object(
      'id', v_devolucion.id,
      'venta_id', v_devolucion.venta_id,
      'caja_turno_id', v_devolucion.caja_turno_id,
      'importe_devuelto', -v_devolucion.variacion_efectivo,
      'variacion_efectivo', v_devolucion.variacion_efectivo,
      'usuario_id', v_devolucion.usuario_id,
      'motivo', v_devolucion.motivo,
      'fecha_movimiento', v_devolucion.fecha_movimiento
    )
  );
end;
$funcion$;

revoke execute
  on function public.registrar_devolucion_venta(uuid, uuid, text)
  from public;
revoke execute
  on function public.registrar_devolucion_venta(uuid, uuid, text)
  from anon;
revoke execute
  on function public.registrar_devolucion_venta(uuid, uuid, text)
  from service_role;
grant execute
  on function public.registrar_devolucion_venta(uuid, uuid, text)
  to authenticated;


-- Consulta separada para que Ventas pueda distinguir anulacion comercial de
-- devolucion fisica sin exponer escritura directa sobre el libro de Caja.
create function public.obtener_estado_devolucion_venta(p_venta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_venta public.ventas%rowtype;
  v_movimiento_original public.caja_movimientos%rowtype;
  v_devolucion public.caja_movimientos%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('venta.ver')
    and not public.usuario_actual_tiene_permiso(
      'caja.registrar_devolucion'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  if p_venta_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  perform 1
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  select movimiento.*
  into v_movimiento_original
  from public.caja_movimientos as movimiento
  where movimiento.venta_id = p_venta_id
    and movimiento.tipo = 'venta';

  select movimiento.*
  into v_devolucion
  from public.caja_movimientos as movimiento
  where movimiento.venta_id = p_venta_id
    and movimiento.tipo = 'devolucion_venta';

  return jsonb_build_object(
    'venta_id', v_venta.id,
    'estado_venta', v_venta.estado,
    'total', v_venta.total,
    'tiene_ingreso_caja', v_movimiento_original.id is not null,
    'devolucion_registrada', v_devolucion.id is not null,
    'devolucion', case
      when v_devolucion.id is null then null
      else jsonb_build_object(
        'id', v_devolucion.id,
        'caja_turno_id', v_devolucion.caja_turno_id,
        'importe_devuelto', -v_devolucion.variacion_efectivo,
        'usuario_id', v_devolucion.usuario_id,
        'motivo', v_devolucion.motivo,
        'fecha_movimiento', v_devolucion.fecha_movimiento
      )
    end
  );
end;
$funcion$;

revoke execute
  on function public.obtener_estado_devolucion_venta(uuid)
  from public;
revoke execute
  on function public.obtener_estado_devolucion_venta(uuid)
  from anon;
revoke execute
  on function public.obtener_estado_devolucion_venta(uuid)
  from service_role;
grant execute
  on function public.obtener_estado_devolucion_venta(uuid)
  to authenticated;

commit;
