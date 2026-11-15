begin;

-- NIT y persona de contacto identifican registros distintos dentro del
-- catálogo de proveedores, ignorando mayúsculas y espacios externos.
create unique index proveedores_contacto_unico
  on public.proveedores (upper(btrim(contacto)))
  where contacto is not null and btrim(contacto) <> '';

commit;
