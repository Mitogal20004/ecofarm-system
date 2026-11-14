begin;

create or replace function public.liberar_reserva_pedido(p_reserva_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $funcion$
declare v_reserva public.reservas_pedido%rowtype;
begin
  select * into v_reserva from public.reservas_pedido where id = p_reserva_id for update;
  if not found then raise exception using errcode = '23503', message = 'La reserva no existe.'; end if;
  if v_reserva.estado <> 'activa' then return; end if;
  update public.lotes set cantidad_disponible = cantidad_disponible + v_reserva.cantidad,
    estado = case when estado = 'agotado' then 'liberado' else estado end, fecha_actualizacion = now()
    where id = v_reserva.lote_id;
  update public.reservas_pedido set estado = 'liberada', fecha_liberacion = now() where id = p_reserva_id;
end;
$funcion$;

create or replace function public.consumir_reserva_pedido(p_reserva_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $funcion$
begin
  update public.reservas_pedido set estado = 'consumida', fecha_liberacion = now()
    where id = p_reserva_id and estado = 'activa';
  if not found then raise exception using errcode = '23514', message = 'La reserva no está activa.'; end if;
end;
$funcion$;

grant execute on function public.liberar_reserva_pedido(uuid) to service_role;
grant execute on function public.consumir_reserva_pedido(uuid) to service_role;

commit;
