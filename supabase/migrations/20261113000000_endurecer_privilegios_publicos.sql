begin;

-- Las operaciones de negocio se exponen únicamente mediante RPC autorizadas.
-- El cliente nunca necesita leer o modificar tablas públicas directamente.
do $bloquear_acceso_directo$
declare
  objeto record;
begin
  for objeto in
    select quote_ident(tabla.table_schema) || '.' || quote_ident(tabla.table_name) as nombre
    from information_schema.tables as tabla
    where tabla.table_schema = 'public'
      and tabla.table_type = 'BASE TABLE'
  loop
    execute format(
      'revoke all on table %s from public, anon, authenticated',
      objeto.nombre
    );
  end loop;
end;
$bloquear_acceso_directo$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Las RPC deben declarar
-- explícitamente si pueden ser invocadas por authenticated.
revoke execute on all functions in schema public from public, anon;

-- Mantiene el mismo criterio para objetos creados por migraciones futuras bajo
-- el propietario habitual de Supabase.
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon;

commit;
