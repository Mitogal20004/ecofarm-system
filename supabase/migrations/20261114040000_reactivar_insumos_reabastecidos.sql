begin;

create or replace function public.desactivar_insumo_con_stock_bajo()
returns trigger
language plpgsql
as $$
begin
  if new.stock_actual < new.stock_minimo then
    new.activo := false;
  elsif tg_op = 'UPDATE'
    and new.stock_actual is distinct from old.stock_actual
    and new.stock_actual >= new.stock_minimo then
    new.activo := true;
  end if;
  return new;
end;
$$;

-- Normaliza los insumos existentes que ya fueron reabastecidos antes de esta regla.
update public.insumos
set activo = true
where stock_actual >= stock_minimo
  and activo = false;

commit;
