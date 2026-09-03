begin;

-- Devuelve el perfil y los roles asignados de un usuario. La autorización se
-- comprueba antes de consultar si el perfil objetivo existe.
create function public.obtener_detalle_usuario(p_usuario_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
begin
  if not public.usuario_actual_tiene_permiso('usuario.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select jsonb_build_object(
    'usuario', jsonb_build_object(
      'id', perfil.id,
      'email', usuario.email,
      'nombre_completo', perfil.nombre_completo,
      'telefono', perfil.telefono,
      'activo', perfil.activo,
      'fecha_creacion', perfil.fecha_creacion,
      'fecha_actualizacion', perfil.fecha_actualizacion
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rol.id,
            'nombre', rol.nombre,
            'descripcion', rol.descripcion,
            'activo', rol.activo,
            'fecha_asignacion', usuario_rol.fecha_asignacion
          )
          order by rol.nombre, rol.id
        )
        from public.usuarios_roles as usuario_rol
        join public.roles as rol
          on rol.id = usuario_rol.rol_id
        where usuario_rol.usuario_id = perfil.id
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from public.perfiles as perfil
  join auth.users as usuario
    on usuario.id = perfil.id
  where perfil.id = p_usuario_id;

  if v_resultado is null then
    raise exception using
      errcode = 'P0002',
      message = 'El usuario solicitado no existe.';
  end if;

  return v_resultado;
end;
$funcion$;

revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from public;
revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from anon;
revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from service_role;
grant execute
  on function public.obtener_detalle_usuario(uuid)
  to authenticated;

commit;
