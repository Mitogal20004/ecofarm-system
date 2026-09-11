begin;

-- Impide que Google OAuth cree identidades nuevas. El hook se ejecuta solo
-- antes de crear un usuario y permite conservar los demás flujos de alta.
create function public.restringir_registro_google(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $funcion$
declare
  v_proveedor text;
begin
  v_proveedor := event -> 'user' -> 'app_metadata' ->> 'provider';

  if v_proveedor = 'google' then
    return pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'http_code', 403,
        'message', 'Esta cuenta no está autorizada para acceder a E-farm.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$funcion$;

revoke execute
  on function public.restringir_registro_google(jsonb)
  from public;
revoke execute
  on function public.restringir_registro_google(jsonb)
  from anon;
revoke execute
  on function public.restringir_registro_google(jsonb)
  from authenticated;
revoke execute
  on function public.restringir_registro_google(jsonb)
  from service_role;

grant usage on schema public to supabase_auth_admin;
grant execute
  on function public.restringir_registro_google(jsonb)
  to supabase_auth_admin;

commit;
