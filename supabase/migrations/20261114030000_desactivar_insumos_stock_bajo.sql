begin;

create or replace function public.desactivar_insumo_con_stock_bajo()
returns trigger
language plpgsql
as $$
begin
  if new.stock_actual < new.stock_minimo then
    new.activo := false;
  end if;
  return new;
end;
$$;

drop trigger if exists insumos_stock_bajo_trigger on public.insumos;
create trigger insumos_stock_bajo_trigger
before insert or update of stock_actual, stock_minimo on public.insumos
for each row
execute function public.desactivar_insumo_con_stock_bajo();

update public.insumos
set activo = false
where stock_actual < stock_minimo;

commit;
