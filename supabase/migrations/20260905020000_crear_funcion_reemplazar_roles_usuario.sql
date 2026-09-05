begin;

-- Reemplaza de forma atómica el conjunto completo de roles de un perfil. Las
-- asignaciones que continúan conservan su fecha_asignacion original.
create function public.reemplazar_roles_usuario(
  p_usuario_id uuid,
  p_roles_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_perfil_activo boolean;
  v_rol_administrador_id uuid;
  v_rol_administrador_activo boolean;
  v_roles jsonb;
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_usuario_id is null or p_roles_ids is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if exists (
    select 1
    from unnest(p_roles_ids) as rol_solicitado(id)
    where rol_solicitado.id is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if cardinality(p_roles_ids) <> (
    select count(distinct rol_solicitado.id)
    from unnest(p_roles_ids) as rol_solicitado(id)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  -- El bloqueo del perfil serializa reemplazos concurrentes para el mismo
  -- usuario y utiliza el mismo orden que actualizar_perfil_usuario.
  select perfil.activo
  into v_perfil_activo
  from public.perfiles as perfil
  where perfil.id = p_usuario_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El usuario solicitado no existe.';
  end if;

  if exists (
    select 1
    from unnest(p_roles_ids) as rol_solicitado(id)
    left join public.roles as rol
      on rol.id = rol_solicitado.id
    where rol.id is null or rol.activo is not true
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  -- La fila real del rol Administrador es el mutex compartido con
  -- actualizar_perfil_usuario para proteger el último Administrador activo.
  select
    rol.id,
    rol.activo
  into
    v_rol_administrador_id,
    v_rol_administrador_activo
  from public.roles as rol
  where rol.nombre = 'Administrador'
  for update;

  if v_perfil_activo
    and v_rol_administrador_activo
    and exists (
      select 1
      from public.usuarios_roles as usuario_rol
      where usuario_rol.usuario_id = p_usuario_id
        and usuario_rol.rol_id = v_rol_administrador_id
    )
    and not (v_rol_administrador_id = any(p_roles_ids))
    and not exists (
      select 1
      from public.perfiles as otro_perfil
      join public.usuarios_roles as otro_usuario_rol
        on otro_usuario_rol.usuario_id = otro_perfil.id
      join public.roles as otro_rol
        on otro_rol.id = otro_usuario_rol.rol_id
      where otro_perfil.id <> p_usuario_id
        and otro_perfil.activo is true
        and otro_rol.id = v_rol_administrador_id
        and otro_rol.activo is true
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  delete from public.usuarios_roles as usuario_rol
  where usuario_rol.usuario_id = p_usuario_id
    and not (usuario_rol.rol_id = any(p_roles_ids));

  insert into public.usuarios_roles (
    usuario_id,
    rol_id
  )
  select
    p_usuario_id,
    rol_solicitado.id
  from unnest(p_roles_ids) as rol_solicitado(id)
  where not exists (
    select 1
    from public.usuarios_roles as usuario_rol
    where usuario_rol.usuario_id = p_usuario_id
      and usuario_rol.rol_id = rol_solicitado.id
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rol.id,
        'nombre', rol.nombre,
        'descripcion', rol.descripcion,
        'activo', rol.activo,
        'fecha_asignacion', usuario_rol.fecha_asignacion
      )
      order by rol.nombre, rol.id
    ),
    '[]'::jsonb
  )
  into v_roles
  from public.usuarios_roles as usuario_rol
  join public.roles as rol
    on rol.id = usuario_rol.rol_id
  where usuario_rol.usuario_id = p_usuario_id;

  return jsonb_build_object(
    'usuario_id', p_usuario_id,
    'roles', v_roles
  );
end;
$funcion$;

revoke execute
  on function public.reemplazar_roles_usuario(uuid, uuid[])
  from public;
revoke execute
  on function public.reemplazar_roles_usuario(uuid, uuid[])
  from anon;
revoke execute
  on function public.reemplazar_roles_usuario(uuid, uuid[])
  from service_role;
grant execute
  on function public.reemplazar_roles_usuario(uuid, uuid[])
  to authenticated;

commit;
