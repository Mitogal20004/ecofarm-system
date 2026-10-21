begin;

-- Caja se modela por usuario: cada responsable puede mantener como máximo un
-- turno abierto. La integración con Ventas se realizará en una migración
-- posterior; esta migración no crea movimientos ni modifica ventas existentes.
insert into public.permisos (
  codigo,
  nombre,
  descripcion
)
values
  (
    'caja.operar',
    'Operar caja propia',
    'Abrir, consultar y cerrar la caja propia.'
  ),
  (
    'caja.ver',
    'Consultar cajas',
    'Consultar el historial y detalle de los turnos de caja.'
  ),
  (
    'caja.supervisar',
    'Supervisar cajas',
    'Cerrar la caja de otro usuario cuando la operación esté autorizada.'
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
    where rol.nombre in (
      'Administrador',
      'Jefe',
      'Encargado de ventas',
      'Encargado de inventario',
      'Empleado'
    )
  ) <> 5 then
    raise exception using
      errcode = 'P0002',
      message = 'No se encontraron todos los roles requeridos para configurar Caja.';
  end if;

  if (
    select count(*)
    from public.permisos as permiso
    where permiso.codigo in (
      'caja.operar',
      'caja.ver',
      'caja.supervisar'
    )
  ) <> 3 then
    raise exception using
      errcode = 'P0002',
      message = 'No se pudieron configurar los permisos requeridos para Caja.';
  end if;
end;
$validacion_roles$;

with asignaciones (rol_nombre, permiso_codigo) as (
  values
    ('Administrador', 'caja.operar'),
    ('Administrador', 'caja.ver'),
    ('Administrador', 'caja.supervisar'),
    ('Jefe', 'caja.operar'),
    ('Jefe', 'caja.ver'),
    ('Jefe', 'caja.supervisar'),
    ('Encargado de ventas', 'caja.operar'),
    ('Encargado de ventas', 'caja.ver'),
    ('Empleado', 'caja.operar')
)
insert into public.roles_permisos (
  rol_id,
  permiso_id
)
select
  rol.id,
  permiso.id
from asignaciones
join public.roles as rol
  on rol.nombre = asignaciones.rol_nombre
join public.permisos as permiso
  on permiso.codigo = asignaciones.permiso_codigo
on conflict (rol_id, permiso_id) do nothing;


create table public.caja_turnos (
  id uuid not null default gen_random_uuid(),
  clave_apertura uuid not null,
  usuario_responsable uuid not null,
  usuario_apertura uuid not null,
  fecha_apertura timestamptz not null default now(),
  fondo_inicial numeric(14, 2) not null,
  estado varchar(20) not null default 'abierta',
  clave_cierre uuid,
  efectivo_esperado_cierre numeric(14, 2),
  efectivo_contado numeric(14, 2),
  diferencia numeric(14, 2),
  usuario_cierre uuid,
  fecha_cierre timestamptz,
  observaciones_cierre varchar(1000),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint caja_turnos_pk primary key (id),
  constraint caja_turnos_clave_apertura_unica unique (clave_apertura),
  constraint caja_turnos_clave_cierre_unica unique (clave_cierre),
  constraint caja_turnos_usuario_responsable_fk
    foreign key (usuario_responsable)
    references public.perfiles (id)
    on delete restrict,
  constraint caja_turnos_usuario_apertura_fk
    foreign key (usuario_apertura)
    references public.perfiles (id)
    on delete restrict,
  constraint caja_turnos_usuario_cierre_fk
    foreign key (usuario_cierre)
    references public.perfiles (id)
    on delete restrict,
  constraint caja_turnos_fondo_inicial_check
    check (fondo_inicial >= 0),
  constraint caja_turnos_estado_check
    check (estado in ('abierta', 'cerrada')),
  constraint caja_turnos_observaciones_check
    check (
      observaciones_cierre is null
      or (
        btrim(observaciones_cierre) <> ''
        and char_length(observaciones_cierre) <= 1000
      )
    ),
  constraint caja_turnos_auditoria_fechas_check
    check (
      fecha_actualizacion >= fecha_creacion
      and fecha_apertura >= fecha_creacion
    ),
  constraint caja_turnos_cierre_check
    check (
      (
        estado = 'abierta'
        and clave_cierre is null
        and efectivo_esperado_cierre is null
        and efectivo_contado is null
        and diferencia is null
        and usuario_cierre is null
        and fecha_cierre is null
        and observaciones_cierre is null
      )
      or (
        estado = 'cerrada'
        and clave_cierre is not null
        and efectivo_esperado_cierre is not null
        and efectivo_esperado_cierre >= 0
        and efectivo_contado is not null
        and efectivo_contado >= 0
        and diferencia is not null
        and diferencia = efectivo_contado - efectivo_esperado_cierre
        and usuario_cierre is not null
        and fecha_cierre is not null
        and fecha_cierre >= fecha_apertura
        and fecha_actualizacion >= fecha_cierre
      )
    )
);

create unique index caja_turnos_usuario_abierta_unica
  on public.caja_turnos (usuario_responsable)
  where estado = 'abierta';

create index indice_caja_turnos_responsable_fecha
  on public.caja_turnos (
    usuario_responsable,
    fecha_apertura desc,
    id desc
  );

create index indice_caja_turnos_estado_fecha
  on public.caja_turnos (estado, fecha_apertura desc, id desc);


create table public.caja_movimientos (
  id uuid not null default gen_random_uuid(),
  caja_turno_id uuid not null,
  venta_id uuid,
  tipo varchar(30) not null,
  variacion_efectivo numeric(14, 2) not null,
  usuario_id uuid not null,
  motivo varchar(500),
  fecha_movimiento timestamptz not null default now(),
  constraint caja_movimientos_pk primary key (id),
  constraint caja_movimientos_turno_fk
    foreign key (caja_turno_id)
    references public.caja_turnos (id)
    on delete restrict,
  constraint caja_movimientos_venta_fk
    foreign key (venta_id)
    references public.ventas (id)
    on delete restrict,
  constraint caja_movimientos_usuario_fk
    foreign key (usuario_id)
    references public.perfiles (id)
    on delete restrict,
  constraint caja_movimientos_venta_tipo_unico
    unique (venta_id, tipo),
  constraint caja_movimientos_tipo_check
    check (tipo in ('venta', 'devolucion_venta')),
  constraint caja_movimientos_variacion_check
    check (
      (tipo = 'venta' and variacion_efectivo > 0)
      or (
        tipo = 'devolucion_venta'
        and variacion_efectivo < 0
      )
    ),
  constraint caja_movimientos_venta_requerida_check
    check (venta_id is not null),
  constraint caja_movimientos_motivo_check
    check (
      (
        tipo = 'venta'
        and (
          motivo is null
          or (
            btrim(motivo) <> ''
            and char_length(motivo) <= 500
          )
        )
      )
      or (
        tipo = 'devolucion_venta'
        and motivo is not null
        and btrim(motivo) <> ''
        and char_length(motivo) <= 500
      )
    )
);

create index indice_caja_movimientos_turno_fecha
  on public.caja_movimientos (
    caja_turno_id,
    fecha_movimiento,
    id
  );

create index indice_caja_movimientos_usuario_fecha
  on public.caja_movimientos (
    usuario_id,
    fecha_movimiento desc,
    id desc
  );

alter table public.caja_turnos enable row level security;
alter table public.caja_movimientos enable row level security;

revoke all privileges on table public.caja_turnos from public;
revoke all privileges on table public.caja_turnos from anon;
revoke all privileges on table public.caja_turnos from authenticated;
revoke all privileges on table public.caja_turnos from service_role;

revoke all privileges on table public.caja_movimientos from public;
revoke all privileges on table public.caja_movimientos from anon;
revoke all privileges on table public.caja_movimientos from authenticated;
revoke all privileges on table public.caja_movimientos from service_role;


-- Solo la transición completa abierta -> cerrada está permitida. Los datos de
-- apertura y cualquier snapshot de una caja cerrada son inmutables.
create function public.proteger_caja_turno()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Los turnos de caja no pueden eliminarse.';
  end if;

  if old.estado = 'cerrada' and new is distinct from old then
    raise exception using
      errcode = '23514',
      message = 'Una caja cerrada no puede modificarse ni reabrirse.';
  end if;

  if row(
    new.id,
    new.clave_apertura,
    new.usuario_responsable,
    new.usuario_apertura,
    new.fecha_apertura,
    new.fondo_inicial,
    new.fecha_creacion
  ) is distinct from row(
    old.id,
    old.clave_apertura,
    old.usuario_responsable,
    old.usuario_apertura,
    old.fecha_apertura,
    old.fondo_inicial,
    old.fecha_creacion
  ) then
    raise exception using
      errcode = '23514',
      message = 'Los datos de apertura de una caja no pueden modificarse.';
  end if;

  if old.estado = 'abierta'
    and new.estado = 'abierta'
    and new is distinct from old
  then
    raise exception using
      errcode = '23514',
      message = 'Una caja abierta solo puede modificarse para cerrarla.';
  end if;

  return new;
end;
$funcion$;

create trigger proteger_caja_turno_antes_mutacion
before update or delete on public.caja_turnos
for each row
execute function public.proteger_caja_turno();

revoke execute on function public.proteger_caja_turno() from public;
revoke execute on function public.proteger_caja_turno() from anon;
revoke execute on function public.proteger_caja_turno() from authenticated;
revoke execute on function public.proteger_caja_turno() from service_role;


-- Todo movimiento futuro deberá bloquear primero el turno. Este mismo lock se
-- utiliza al cerrar, de modo que un movimiento no pueda aparecer después del
-- snapshot de cierre ni competir con él.
create function public.validar_nuevo_caja_movimiento()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_estado public.caja_turnos.estado%type;
  v_fecha_apertura public.caja_turnos.fecha_apertura%type;
begin
  select
    turno.estado,
    turno.fecha_apertura
  into
    v_estado,
    v_fecha_apertura
  from public.caja_turnos as turno
  where turno.id = new.caja_turno_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La caja solicitada no existe.';
  end if;

  if v_estado <> 'abierta' then
    raise exception using
      errcode = '23514',
      message = 'No se pueden registrar movimientos en una caja cerrada.';
  end if;

  if new.fecha_movimiento < v_fecha_apertura then
    raise exception using
      errcode = '23514',
      message = 'La fecha del movimiento no puede preceder la apertura de la caja.';
  end if;

  return new;
end;
$funcion$;

create trigger validar_nuevo_caja_movimiento_antes_insertar
before insert on public.caja_movimientos
for each row
execute function public.validar_nuevo_caja_movimiento();

revoke execute on function public.validar_nuevo_caja_movimiento()
  from public;
revoke execute on function public.validar_nuevo_caja_movimiento()
  from anon;
revoke execute on function public.validar_nuevo_caja_movimiento()
  from authenticated;
revoke execute on function public.validar_nuevo_caja_movimiento()
  from service_role;


create function public.proteger_caja_movimiento()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
begin
  raise exception using
    errcode = '42501',
    message = 'Los movimientos de caja son inmutables.';
end;
$funcion$;

create trigger proteger_caja_movimiento_antes_mutacion
before update or delete on public.caja_movimientos
for each row
execute function public.proteger_caja_movimiento();

revoke execute on function public.proteger_caja_movimiento() from public;
revoke execute on function public.proteger_caja_movimiento() from anon;
revoke execute on function public.proteger_caja_movimiento()
  from authenticated;
revoke execute on function public.proteger_caja_movimiento()
  from service_role;


-- Helper interno. En esta primera fase el libro permanece vacío hasta que la
-- integración transaccional con Ventas sea implementada explícitamente.
create function public.calcular_resumen_caja_turno(p_caja_turno_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $funcion$
  select jsonb_build_object(
    'fondo_inicial', turno.fondo_inicial,
    'cantidad_ventas', coalesce(movimiento.cantidad_ventas, 0),
    'ventas_efectivo', coalesce(movimiento.ventas_efectivo, 0),
    'cantidad_devoluciones',
      coalesce(movimiento.cantidad_devoluciones, 0),
    'devoluciones_efectivo',
      coalesce(movimiento.devoluciones_efectivo, 0),
    'movimiento_neto', coalesce(movimiento.movimiento_neto, 0),
    'efectivo_esperado',
      turno.fondo_inicial + coalesce(movimiento.movimiento_neto, 0)
  )
  from public.caja_turnos as turno
  left join lateral (
    select
      count(*) filter (
        where caja_movimiento.tipo = 'venta'
      ) as cantidad_ventas,
      coalesce(
        sum(caja_movimiento.variacion_efectivo) filter (
          where caja_movimiento.tipo = 'venta'
        ),
        0
      ) as ventas_efectivo,
      count(*) filter (
        where caja_movimiento.tipo = 'devolucion_venta'
      ) as cantidad_devoluciones,
      coalesce(
        -sum(caja_movimiento.variacion_efectivo) filter (
          where caja_movimiento.tipo = 'devolucion_venta'
        ),
        0
      ) as devoluciones_efectivo,
      coalesce(sum(caja_movimiento.variacion_efectivo), 0)
        as movimiento_neto
    from public.caja_movimientos as caja_movimiento
    where caja_movimiento.caja_turno_id = turno.id
  ) as movimiento on true
  where turno.id = p_caja_turno_id;
$funcion$;

revoke execute on function public.calcular_resumen_caja_turno(uuid)
  from public;
revoke execute on function public.calcular_resumen_caja_turno(uuid)
  from anon;
revoke execute on function public.calcular_resumen_caja_turno(uuid)
  from authenticated;
revoke execute on function public.calcular_resumen_caja_turno(uuid)
  from service_role;


create function public.abrir_caja(
  p_clave_idempotencia uuid,
  p_fondo_inicial numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_turno public.caja_turnos%rowtype;
  v_restriccion text;
begin
  if not public.usuario_actual_tiene_permiso('caja.operar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_clave_idempotencia is null
    or p_fondo_inicial is null
    or p_fondo_inicial < 0
    or p_fondo_inicial > 999999999999.99
    or round(p_fondo_inicial, 2) <> p_fondo_inicial
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  perform 1
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  -- Serializa aperturas concurrentes del mismo usuario. El índice parcial es
  -- la segunda barrera y protege también escrituras futuras.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('caja:' || v_usuario_id::text, 0)
  );

  select turno.*
  into v_turno
  from public.caja_turnos as turno
  where turno.clave_apertura = p_clave_idempotencia;

  if found then
    if v_turno.usuario_responsable <> v_usuario_id
      or v_turno.usuario_apertura <> v_usuario_id
      or v_turno.fondo_inicial <> p_fondo_inicial
    then
      raise exception using
        errcode = '23505',
        message = 'La clave de apertura ya fue utilizada.';
    end if;

    return jsonb_build_object(
      'cambio', false,
      'caja', jsonb_build_object(
        'id', v_turno.id,
        'estado', v_turno.estado,
        'usuario_responsable', v_turno.usuario_responsable,
        'usuario_apertura', v_turno.usuario_apertura,
        'fondo_inicial', v_turno.fondo_inicial,
        'fecha_apertura', v_turno.fecha_apertura,
        'fecha_cierre', v_turno.fecha_cierre
      )
    );
  end if;

  perform 1
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta'
  for update;

  if found then
    raise exception using
      errcode = '23505',
      message = 'El usuario ya tiene una caja abierta.';
  end if;

  insert into public.caja_turnos (
    clave_apertura,
    usuario_responsable,
    usuario_apertura,
    fondo_inicial
  )
  values (
    p_clave_idempotencia,
    v_usuario_id,
    v_usuario_id,
    p_fondo_inicial
  )
  returning * into v_turno;

  return jsonb_build_object(
    'cambio', true,
    'caja', jsonb_build_object(
      'id', v_turno.id,
      'estado', v_turno.estado,
      'usuario_responsable', v_turno.usuario_responsable,
      'usuario_apertura', v_turno.usuario_apertura,
      'fondo_inicial', v_turno.fondo_inicial,
      'fecha_apertura', v_turno.fecha_apertura,
      'fecha_cierre', v_turno.fecha_cierre
    )
  );
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'caja_turnos_usuario_abierta_unica' then
      raise exception using
        errcode = '23505',
        message = 'El usuario ya tiene una caja abierta.';
    end if;

    if v_restriccion = 'caja_turnos_clave_apertura_unica' then
      raise exception using
        errcode = '23505',
        message = 'La clave de apertura ya fue utilizada.';
    end if;

    raise;
end;
$funcion$;

revoke execute on function public.abrir_caja(uuid, numeric) from public;
revoke execute on function public.abrir_caja(uuid, numeric) from anon;
revoke execute on function public.abrir_caja(uuid, numeric)
  from service_role;
grant execute on function public.abrir_caja(uuid, numeric)
  to authenticated;


create function public.obtener_caja_actual()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_turno public.caja_turnos%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('caja.operar')
    and not public.usuario_actual_tiene_permiso('caja.ver')
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select turno.*
  into v_turno
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta';

  if not found then
    return jsonb_build_object(
      'caja', null,
      'resumen', null
    );
  end if;

  return jsonb_build_object(
    'caja', jsonb_build_object(
      'id', v_turno.id,
      'estado', v_turno.estado,
      'usuario_responsable', v_turno.usuario_responsable,
      'usuario_apertura', v_turno.usuario_apertura,
      'fondo_inicial', v_turno.fondo_inicial,
      'fecha_apertura', v_turno.fecha_apertura
    ),
    'resumen', public.calcular_resumen_caja_turno(v_turno.id)
  );
end;
$funcion$;

revoke execute on function public.obtener_caja_actual() from public;
revoke execute on function public.obtener_caja_actual() from anon;
revoke execute on function public.obtener_caja_actual()
  from service_role;
grant execute on function public.obtener_caja_actual() to authenticated;


create function public.obtener_resumen_caja_actual()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
begin
  if not public.usuario_actual_tiene_permiso('caja.operar')
    and not public.usuario_actual_tiene_permiso('caja.ver')
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select turno.id
  into v_turno_id
  from public.caja_turnos as turno
  where turno.usuario_responsable = v_usuario_id
    and turno.estado = 'abierta';

  return jsonb_build_object(
    'caja_id', v_turno_id,
    'resumen', case
      when v_turno_id is null then null
      else public.calcular_resumen_caja_turno(v_turno_id)
    end
  );
end;
$funcion$;

revoke execute on function public.obtener_resumen_caja_actual()
  from public;
revoke execute on function public.obtener_resumen_caja_actual()
  from anon;
revoke execute on function public.obtener_resumen_caja_actual()
  from service_role;
grant execute on function public.obtener_resumen_caja_actual()
  to authenticated;


create function public.cerrar_caja(
  p_caja_turno_id uuid,
  p_clave_idempotencia uuid,
  p_efectivo_contado numeric,
  p_observaciones text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_puede_operar boolean;
  v_puede_supervisar boolean;
  v_observaciones text;
  v_turno public.caja_turnos%rowtype;
  v_resumen jsonb;
  v_efectivo_esperado numeric(14, 2);
  v_restriccion text;
begin
  v_puede_operar := public.usuario_actual_tiene_permiso('caja.operar');
  v_puede_supervisar :=
    public.usuario_actual_tiene_permiso('caja.supervisar');

  if not v_puede_operar and not v_puede_supervisar then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_observaciones := nullif(
    btrim(regexp_replace(p_observaciones, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_caja_turno_id is null
    or p_clave_idempotencia is null
    or p_efectivo_contado is null
    or p_efectivo_contado < 0
    or p_efectivo_contado > 999999999999.99
    or round(p_efectivo_contado, 2) <> p_efectivo_contado
    or char_length(v_observaciones) > 1000
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  perform 1
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

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

  if v_turno.usuario_responsable = v_usuario_id then
    if not v_puede_operar and not v_puede_supervisar then
      raise exception using
        errcode = '42501',
        message = 'No tiene permiso para realizar esta acción.';
    end if;
  elsif not v_puede_supervisar then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para cerrar la caja de otro usuario.';
  end if;

  if v_turno.estado = 'cerrada' then
    if v_turno.clave_cierre = p_clave_idempotencia
      and v_turno.efectivo_contado = p_efectivo_contado
      and v_turno.observaciones_cierre is not distinct from v_observaciones
    then
      return jsonb_build_object(
        'cambio', false,
        'caja', jsonb_build_object(
          'id', v_turno.id,
          'estado', v_turno.estado,
          'efectivo_esperado', v_turno.efectivo_esperado_cierre,
          'efectivo_contado', v_turno.efectivo_contado,
          'diferencia', v_turno.diferencia,
          'usuario_cierre', v_turno.usuario_cierre,
          'fecha_cierre', v_turno.fecha_cierre,
          'observaciones', v_turno.observaciones_cierre
        )
      );
    end if;

    raise exception using
      errcode = '23514',
      message = 'La caja ya fue cerrada.';
  end if;

  v_resumen := public.calcular_resumen_caja_turno(v_turno.id);
  v_efectivo_esperado :=
    (v_resumen ->> 'efectivo_esperado')::numeric(14, 2);

  update public.caja_turnos as turno
  set
    estado = 'cerrada',
    clave_cierre = p_clave_idempotencia,
    efectivo_esperado_cierre = v_efectivo_esperado,
    efectivo_contado = p_efectivo_contado,
    diferencia = p_efectivo_contado - v_efectivo_esperado,
    usuario_cierre = v_usuario_id,
    fecha_cierre = now(),
    observaciones_cierre = v_observaciones,
    fecha_actualizacion = now()
  where turno.id = v_turno.id
  returning turno.* into v_turno;

  return jsonb_build_object(
    'cambio', true,
    'caja', jsonb_build_object(
      'id', v_turno.id,
      'estado', v_turno.estado,
      'efectivo_esperado', v_turno.efectivo_esperado_cierre,
      'efectivo_contado', v_turno.efectivo_contado,
      'diferencia', v_turno.diferencia,
      'usuario_cierre', v_turno.usuario_cierre,
      'fecha_cierre', v_turno.fecha_cierre,
      'observaciones', v_turno.observaciones_cierre
    )
  );
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'caja_turnos_clave_cierre_unica' then
      raise exception using
        errcode = '23505',
        message = 'La clave de cierre ya fue utilizada.';
    end if;

    raise;
end;
$funcion$;

revoke execute
  on function public.cerrar_caja(uuid, uuid, numeric, text)
  from public;
revoke execute
  on function public.cerrar_caja(uuid, uuid, numeric, text)
  from anon;
revoke execute
  on function public.cerrar_caja(uuid, uuid, numeric, text)
  from service_role;
grant execute
  on function public.cerrar_caja(uuid, uuid, numeric, text)
  to authenticated;


create function public.listar_cajas(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_usuario_id uuid default null,
  p_estado text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_puede_operar boolean;
  v_puede_ver boolean;
  v_estado text;
  v_total bigint;
  v_cajas jsonb;
begin
  v_puede_operar := public.usuario_actual_tiene_permiso('caja.operar');
  v_puede_ver := public.usuario_actual_tiene_permiso('caja.ver');

  if not v_puede_operar and not v_puede_ver then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_pagina is null
    or p_pagina < 1
    or p_limite is null
    or p_limite < 1
    or p_limite > 100
    or (
      p_fecha_desde is not null
      and p_fecha_hasta is not null
      and p_fecha_desde > p_fecha_hasta
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_estado := nullif(lower(btrim(p_estado)), '');

  if v_estado is not null and v_estado not in ('abierta', 'cerrada') then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.caja_turnos as turno
  where (v_puede_ver or turno.usuario_responsable = v_usuario_id)
    and (p_usuario_id is null or turno.usuario_responsable = p_usuario_id)
    and (v_estado is null or turno.estado = v_estado)
    and (
      p_fecha_desde is null
      or turno.fecha_apertura >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      p_fecha_hasta is null
      or turno.fecha_apertura < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'estado', pagina.estado,
        'usuario_responsable', jsonb_build_object(
          'id', pagina.usuario_responsable,
          'nombre_completo', pagina.nombre_responsable
        ),
        'usuario_apertura', jsonb_build_object(
          'id', pagina.usuario_apertura,
          'nombre_completo', pagina.nombre_apertura
        ),
        'fecha_apertura', pagina.fecha_apertura,
        'fondo_inicial', pagina.fondo_inicial,
        'ventas_efectivo', pagina.ventas_efectivo,
        'devoluciones_efectivo', pagina.devoluciones_efectivo,
        'efectivo_esperado', case
          when pagina.estado = 'cerrada'
            then pagina.efectivo_esperado_cierre
          else pagina.fondo_inicial + pagina.movimiento_neto
        end,
        'efectivo_contado', pagina.efectivo_contado,
        'diferencia', pagina.diferencia,
        'usuario_cierre', case
          when pagina.usuario_cierre is null then null
          else jsonb_build_object(
            'id', pagina.usuario_cierre,
            'nombre_completo', pagina.nombre_cierre
          )
        end,
        'fecha_cierre', pagina.fecha_cierre,
        'observaciones', pagina.observaciones_cierre
      )
      order by pagina.fecha_apertura desc, pagina.id desc
    ),
    '[]'::jsonb
  )
  into v_cajas
  from (
    select
      turno.*,
      responsable.nombre_completo as nombre_responsable,
      apertura.nombre_completo as nombre_apertura,
      cierre.nombre_completo as nombre_cierre,
      coalesce(movimiento.ventas_efectivo, 0) as ventas_efectivo,
      coalesce(movimiento.devoluciones_efectivo, 0)
        as devoluciones_efectivo,
      coalesce(movimiento.movimiento_neto, 0) as movimiento_neto
    from public.caja_turnos as turno
    join public.perfiles as responsable
      on responsable.id = turno.usuario_responsable
    join public.perfiles as apertura
      on apertura.id = turno.usuario_apertura
    left join public.perfiles as cierre
      on cierre.id = turno.usuario_cierre
    left join lateral (
      select
        coalesce(
          sum(caja_movimiento.variacion_efectivo) filter (
            where caja_movimiento.tipo = 'venta'
          ),
          0
        ) as ventas_efectivo,
        coalesce(
          -sum(caja_movimiento.variacion_efectivo) filter (
            where caja_movimiento.tipo = 'devolucion_venta'
          ),
          0
        ) as devoluciones_efectivo,
        coalesce(sum(caja_movimiento.variacion_efectivo), 0)
          as movimiento_neto
      from public.caja_movimientos as caja_movimiento
      where caja_movimiento.caja_turno_id = turno.id
    ) as movimiento on true
    where (v_puede_ver or turno.usuario_responsable = v_usuario_id)
      and (
        p_usuario_id is null
        or turno.usuario_responsable = p_usuario_id
      )
      and (v_estado is null or turno.estado = v_estado)
      and (
        p_fecha_desde is null
        or turno.fecha_apertura >= (
          p_fecha_desde::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        p_fecha_hasta is null
        or turno.fecha_apertura < (
          (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
        )
      )
    order by turno.fecha_apertura desc, turno.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'cajas', v_cajas,
    'paginacion', jsonb_build_object(
      'pagina', p_pagina,
      'limite', p_limite,
      'total', v_total,
      'total_paginas', case
        when v_total = 0 then 0
        else (v_total + p_limite - 1) / p_limite
      end
    )
  );
end;
$funcion$;

revoke execute
  on function public.listar_cajas(integer, integer, date, date, uuid, text)
  from public;
revoke execute
  on function public.listar_cajas(integer, integer, date, date, uuid, text)
  from anon;
revoke execute
  on function public.listar_cajas(integer, integer, date, date, uuid, text)
  from service_role;
grant execute
  on function public.listar_cajas(integer, integer, date, date, uuid, text)
  to authenticated;


create function public.obtener_caja(p_caja_turno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_puede_operar boolean;
  v_puede_ver boolean;
  v_turno public.caja_turnos%rowtype;
  v_caja jsonb;
begin
  v_puede_operar := public.usuario_actual_tiene_permiso('caja.operar');
  v_puede_ver := public.usuario_actual_tiene_permiso('caja.ver');

  if not v_puede_operar and not v_puede_ver then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_caja_turno_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select turno.*
  into v_turno
  from public.caja_turnos as turno
  where turno.id = p_caja_turno_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La caja solicitada no existe.';
  end if;

  if not v_puede_ver and v_turno.usuario_responsable <> v_usuario_id then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para consultar la caja de otro usuario.';
  end if;

  select jsonb_build_object(
    'id', turno.id,
    'estado', turno.estado,
    'usuario_responsable', jsonb_build_object(
      'id', responsable.id,
      'nombre_completo', responsable.nombre_completo
    ),
    'usuario_apertura', jsonb_build_object(
      'id', apertura.id,
      'nombre_completo', apertura.nombre_completo
    ),
    'fecha_apertura', turno.fecha_apertura,
    'fondo_inicial', turno.fondo_inicial,
    'efectivo_esperado_cierre', turno.efectivo_esperado_cierre,
    'efectivo_contado', turno.efectivo_contado,
    'diferencia', turno.diferencia,
    'usuario_cierre', case
      when cierre.id is null then null
      else jsonb_build_object(
        'id', cierre.id,
        'nombre_completo', cierre.nombre_completo
      )
    end,
    'fecha_cierre', turno.fecha_cierre,
    'observaciones', turno.observaciones_cierre,
    'fecha_creacion', turno.fecha_creacion,
    'fecha_actualizacion', turno.fecha_actualizacion
  )
  into v_caja
  from public.caja_turnos as turno
  join public.perfiles as responsable
    on responsable.id = turno.usuario_responsable
  join public.perfiles as apertura
    on apertura.id = turno.usuario_apertura
  left join public.perfiles as cierre
    on cierre.id = turno.usuario_cierre
  where turno.id = p_caja_turno_id;

  return jsonb_build_object(
    'caja', v_caja,
    'resumen', public.calcular_resumen_caja_turno(p_caja_turno_id)
  );
end;
$funcion$;

revoke execute on function public.obtener_caja(uuid) from public;
revoke execute on function public.obtener_caja(uuid) from anon;
revoke execute on function public.obtener_caja(uuid) from service_role;
grant execute on function public.obtener_caja(uuid) to authenticated;

commit;
