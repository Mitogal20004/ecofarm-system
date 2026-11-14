begin;

-- El backend usa la clave administrativa de Supabase, cuyo rol efectivo es
-- service_role. Las migraciones operativas revocan los permisos públicos, por
-- lo que este acceso debe declararse explícitamente para las rutas internas.
grant select, insert, update on table public.lotes to service_role;
grant select, insert, update, delete on table public.proveedores to service_role;
grant select, insert, update on table public.insumos to service_role;
grant select, insert, update on table public.qr_lotes to service_role;
grant select on table public.inspecciones_calidad to service_role;
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

grant usage, select on all sequences in schema public to service_role;

commit;
