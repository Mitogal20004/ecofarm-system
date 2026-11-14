begin;

-- Permisos de lectura y escritura usados por las rutas internas de operaciones.
-- Es idempotente y corrige bases donde la migración inicial ya fue aplicada.
grant select, insert, update on table public.ordenes_empaque to service_role;
grant select, insert, update on table public.ordenes_empaque_detalles to service_role;
grant select on table public.reservas_pedido to service_role;

commit;
