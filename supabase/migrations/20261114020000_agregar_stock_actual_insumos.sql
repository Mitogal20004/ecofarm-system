begin;

alter table public.insumos
  add column stock_actual numeric(14,4) not null default 0;

alter table public.insumos
  add constraint insumos_stock_actual_check check (stock_actual >= 0);

commit;
