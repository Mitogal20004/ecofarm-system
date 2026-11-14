-- Permisos requeridos por el backend de E-farm.
-- Ejecutar en Supabase SQL Editor usando el botón Run.
-- Es seguro ejecutarlo más de una vez.

begin;

grant select, insert, update on table public.lotes to service_role;
grant select, insert, update, delete on table public.proveedores to service_role;
grant select, insert, update on table public.insumos to service_role;
grant select, insert, update on table public.inspecciones_calidad to service_role;
grant select, insert, update on table public.mermas to service_role;
grant select, insert, update on table public.compras to service_role;
grant select, insert, update on table public.compra_detalles to service_role;
grant select, insert, update on table public.pedidos to service_role;
grant select, insert, update on table public.pedido_detalles to service_role;
grant select, insert, update on table public.despachos to service_role;
grant select, insert, update on table public.ordenes_empaque to service_role;
grant select, insert, update on table public.ordenes_empaque_detalles to service_role;
grant select on table public.reservas_pedido to service_role;
grant select, insert, update on table public.qr_lotes to service_role;

grant usage, select on all sequences in schema public to service_role;

commit;
