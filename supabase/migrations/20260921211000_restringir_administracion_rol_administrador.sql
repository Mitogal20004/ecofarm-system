begin;

-- Conserva la administración general de perfiles mediante usuario.administrar,
-- pero reserva cualquier cambio sobre un Administrador a rol.administrar.
create or replace function public.actualizar_perfil_usuario(
  p_usuario_id uuid,
  p_cambios jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_perfil public.perfiles%rowtype;
  v_nombre_completo text;
  v_telefono text;
  v_activo boolean;
  v_rol_administrador_id uuid;
  v_puede_administrar_roles boolean;
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_puede_administrar_roles :=
    public.usuario_actual_tiene_permiso('rol.administrar');

  if p_usuario_id is null
    or p_cambios is null
    or jsonb_typeof(p_cambios) <> 'object'
    or p_cambios = '{}'::jsonb
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_cambios) as campo(nombre)
    where campo.nombre not in ('nombre_completo', 'telefono', 'activo')
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'nombre_completo'
    and jsonb_typeof(p_cambios -> 'nombre_completo') <> 'string'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'telefono'
    and jsonb_typeof(p_cambios -> 'telefono') not in ('string', 'null')
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'activo'
    and jsonb_typeof(p_cambios -> 'activo') <> 'boolean'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select perfil.*
  into v_perfil
  from public.perfiles as perfil
  where perfil.id = p_usuario_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El usuario solicitado no existe.';
  end if;

  v_nombre_completo := v_perfil.nombre_completo;
  v_telefono := v_perfil.telefono;
  v_activo := v_perfil.activo;

  if p_cambios ? 'nombre_completo' then
    v_nombre_completo := btrim(p_cambios ->> 'nombre_completo');

    if v_nombre_completo = '' or char_length(v_nombre_completo) > 150 then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'telefono' then
    if jsonb_typeof(p_cambios -> 'telefono') = 'null' then
      v_telefono := null;
    else
      v_telefono := p_cambios ->> 'telefono';

      if char_length(v_telefono) > 30 then
        raise exception using
          errcode = '22023',
          message = 'Los parámetros proporcionados no son válidos.';
      end if;
    end if;
  end if;

  if p_cambios ? 'activo' then
    v_activo := (p_cambios ->> 'activo')::boolean;
  end if;

  -- Esta fila es el mutex compartido con reemplazar_roles_usuario. Además
  -- estabiliza la identificación del rol reservado durante la operación.
  select rol.id
  into v_rol_administrador_id
  from public.roles as rol
  where rol.nombre = 'Administrador'
  for update;

  if v_rol_administrador_id is not null
    and exists (
      select 1
      from public.usuarios_roles as usuario_rol
      where usuario_rol.usuario_id = p_usuario_id
        and usuario_rol.rol_id = v_rol_administrador_id
    )
    and not v_puede_administrar_roles
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if v_perfil.activo and not v_activo
    and v_rol_administrador_id is not null
    and exists (
      select 1
      from public.usuarios_roles as usuario_rol
      where usuario_rol.usuario_id = p_usuario_id
        and usuario_rol.rol_id = v_rol_administrador_id
    )
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

  update public.perfiles as perfil
  set
    nombre_completo = v_nombre_completo,
    telefono = v_telefono,
    activo = v_activo,
    fecha_actualizacion = now()
  where perfil.id = p_usuario_id
  returning perfil.* into v_perfil;

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v_perfil.id,
      'nombre_completo', v_perfil.nombre_completo,
      'telefono', v_perfil.telefono,
      'activo', v_perfil.activo,
      'fecha_creacion', v_perfil.fecha_creacion,
      'fecha_actualizacion', v_perfil.fecha_actualizacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from public;
revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from anon;
revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from service_role;
grant execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  to authenticated;


-- Conserva el reemplazo atómico de roles, reservando tanto la asignación
-- de Administrador como cualquier cambio a un Administrador existente.
create or replace function public.reemplazar_roles_usuario(
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
  v_puede_administrar_roles boolean;
  v_roles jsonb;
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_puede_administrar_roles :=
    public.usuario_actual_tiene_permiso('rol.administrar');

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

  if not v_puede_administrar_roles
    and v_rol_administrador_id is not null
    and (
      v_rol_administrador_id = any(p_roles_ids)
      or exists (
        select 1
        from public.usuarios_roles as usuario_rol
        where usuario_rol.usuario_id = p_usuario_id
          and usuario_rol.rol_id = v_rol_administrador_id
      )
    )
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

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
