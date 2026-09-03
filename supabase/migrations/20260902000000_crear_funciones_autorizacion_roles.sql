begin;

-- Comprueba un permiso usando exclusivamente la identidad contenida en el JWT.
-- Esta función es interna: las sesiones autenticadas no pueden invocarla
-- directamente, pero las RPC SECURITY DEFINER del mismo propietario sí.
create function public.usuario_actual_tiene_permiso(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $funcion$
  select exists (
    select 1
    from public.perfiles as perfil
    join public.usuarios_roles as usuario_rol
      on usuario_rol.usuario_id = perfil.id
    join public.roles as rol
      on rol.id = usuario_rol.rol_id
    join public.roles_permisos as rol_permiso
      on rol_permiso.rol_id = rol.id
    join public.permisos as permiso
      on permiso.id = rol_permiso.permiso_id
    where perfil.id = auth.uid()
      and perfil.activo is true
      and rol.activo is true
      and permiso.activo is true
      and permiso.codigo = p_codigo
  );
$funcion$;

revoke execute
  on function public.usuario_actual_tiene_permiso(text)
  from public;
revoke execute
  on function public.usuario_actual_tiene_permiso(text)
  from anon;
revoke execute
  on function public.usuario_actual_tiene_permiso(text)
  from authenticated;
revoke execute
  on function public.usuario_actual_tiene_permiso(text)
  from service_role;

-- Expone exclusivamente el catálogo de roles activos a usuarios que poseen el
-- permiso estable rol.ver. La comprobación se realiza también en PostgreSQL.
create function public.listar_roles_activos()
returns table (
  id uuid,
  nombre varchar(80),
  descripcion text
)
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
begin
  if not public.usuario_actual_tiene_permiso('rol.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  return query
  select
    rol.id,
    rol.nombre,
    rol.descripcion
  from public.roles as rol
  where rol.activo is true
  order by rol.nombre, rol.id;
end;
$funcion$;

revoke execute
  on function public.listar_roles_activos()
  from public;
revoke execute
  on function public.listar_roles_activos()
  from anon;
revoke execute
  on function public.listar_roles_activos()
  from service_role;
grant execute
  on function public.listar_roles_activos()
  to authenticated;

commit;
