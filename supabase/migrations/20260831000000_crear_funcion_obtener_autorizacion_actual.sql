-- Resuelve la autorización del usuario identificado por el JWT de Supabase.
-- La función no recibe identificadores del cliente y auth.uid() es su única
-- fuente para determinar la identidad que puede consultar.
create function public.obtener_autorizacion_actual()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $funcion$
  with perfil_actual as (
    select
      perfiles.id,
      perfiles.nombre_completo,
      perfiles.telefono,
      perfiles.activo,
      perfiles.fecha_creacion,
      perfiles.fecha_actualizacion
    from public.perfiles
    where perfiles.id = auth.uid()
  ),
  roles_activos as (
    select distinct
      roles.id,
      roles.nombre,
      roles.descripcion,
      roles.activo,
      roles.fecha_creacion,
      roles.fecha_actualizacion
    from perfil_actual
    join public.usuarios_roles
      on usuarios_roles.usuario_id = perfil_actual.id
    join public.roles
      on roles.id = usuarios_roles.rol_id
    where perfil_actual.activo is true
      and roles.activo is true
  ),
  permisos_activos as (
    select distinct
      permisos.id,
      permisos.codigo,
      permisos.nombre,
      permisos.descripcion,
      permisos.activo,
      permisos.fecha_creacion,
      permisos.fecha_actualizacion
    from roles_activos
    join public.roles_permisos
      on roles_permisos.rol_id = roles_activos.id
    join public.permisos
      on permisos.id = roles_permisos.permiso_id
    where permisos.activo is true
  )
  select jsonb_build_object(
    'perfil', (
      select to_jsonb(perfil_actual)
      from perfil_actual
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          to_jsonb(roles_activos)
          order by roles_activos.nombre, roles_activos.id
        )
        from roles_activos
      ),
      '[]'::jsonb
    ),
    'permisos', coalesce(
      (
        select jsonb_agg(
          to_jsonb(permisos_activos)
          order by permisos_activos.codigo, permisos_activos.id
        )
        from permisos_activos
      ),
      '[]'::jsonb
    )
  );
$funcion$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC de forma predeterminada. Se elimina
-- ese acceso y se autoriza únicamente a sesiones autenticadas de Supabase.
revoke all on function public.obtener_autorizacion_actual() from public;
revoke all on function public.obtener_autorizacion_actual() from anon;
revoke all on function public.obtener_autorizacion_actual() from service_role;
grant execute on function public.obtener_autorizacion_actual() to authenticated;
