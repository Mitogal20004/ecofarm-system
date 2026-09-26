begin;

-- Crea el perfil y su rol inicial en una única transacción PostgreSQL. La
-- identidad correspondiente debe haber sido creada previamente por Auth.
create function public.crear_perfil_usuario(
  p_usuario_id uuid,
  p_nombre_completo text,
  p_nombre_usuario text,
  p_telefono text,
  p_rol_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_nombre_completo text;
  v_nombre_usuario text;
  v_telefono text;
  v_perfil public.perfiles%rowtype;
  v_rol public.roles%rowtype;
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
    or p_nombre_completo is null
    or p_nombre_usuario is null
    or p_rol_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_nombre_completo := btrim(p_nombre_completo);
  v_nombre_usuario := lower(btrim(p_nombre_usuario));
  v_telefono := nullif(btrim(p_telefono), '');

  if v_nombre_completo = ''
    or char_length(v_nombre_completo) > 150
    or char_length(v_nombre_usuario) < 3
    or char_length(v_nombre_usuario) > 50
    or v_nombre_usuario !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    or char_length(v_telefono) > 30
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if not exists (
    select 1
    from auth.users as usuario_auth
    where usuario_auth.id = p_usuario_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select rol.*
  into v_rol
  from public.roles as rol
  where rol.id = p_rol_id
    and rol.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if v_rol.nombre = 'Administrador' and not v_puede_administrar_roles then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  insert into public.perfiles (
    id,
    nombre_completo,
    nombre_usuario,
    telefono,
    activo
  )
  values (
    p_usuario_id,
    v_nombre_completo,
    v_nombre_usuario,
    v_telefono,
    true
  )
  returning * into v_perfil;

  insert into public.usuarios_roles (
    usuario_id,
    rol_id
  )
  values (
    v_perfil.id,
    v_rol.id
  );

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v_perfil.id,
      'nombre_completo', v_perfil.nombre_completo,
      'nombre_usuario', v_perfil.nombre_usuario,
      'telefono', v_perfil.telefono,
      'activo', v_perfil.activo
    ),
    'rol', jsonb_build_object(
      'id', v_rol.id,
      'nombre', v_rol.nombre,
      'descripcion', v_rol.descripcion,
      'activo', v_rol.activo
    )
  );
end;
$funcion$;

revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid)
  from public;
revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid)
  from anon;
revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid)
  from service_role;
grant execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid)
  to authenticated;

commit;
