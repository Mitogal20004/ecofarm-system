begin;

-- El proceso de alertas corre exclusivamente en el backend con service_role.
-- No se conceden permisos a anon ni a authenticated.
grant select on table public.inventario_existencias to service_role;
grant select on table public.insumos to service_role;
grant insert on table public.alertas to service_role;

commit;
