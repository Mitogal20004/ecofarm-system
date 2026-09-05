begin;

-- Actualiza exclusivamente los campos administrables de un perfil existente.
-- La presencia de cada clave en p_cambios determina si el campo se modifica.
create function public.actualizar_perfil_usuario(
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
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

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

  if v_perfil.activo and not v_activo then
    -- Esta fila funciona como mutex para serializar las operaciones que pueden
    -- reducir la cantidad de administradores activos.
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

commit;
