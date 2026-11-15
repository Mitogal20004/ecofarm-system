begin;

create or replace function public.listar_destinatarios_alertas_roles()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $funcion$
  select distinct lower(usuario.email)::text
  from auth.users as usuario
  join public.perfiles as perfil on perfil.id = usuario.id
  join public.usuarios_roles as usuario_rol on usuario_rol.usuario_id = perfil.id
  join public.roles as rol on rol.id = usuario_rol.rol_id
  where perfil.activo is true
    and rol.activo is true
    and lower(rol.nombre) in ('jefe', 'administrador')
    and usuario.email is not null
    and btrim(usuario.email) <> ''
  order by lower(usuario.email);
$funcion$;

revoke all on function public.listar_destinatarios_alertas_roles() from public, anon, authenticated;
grant execute on function public.listar_destinatarios_alertas_roles() to service_role;

commit;
