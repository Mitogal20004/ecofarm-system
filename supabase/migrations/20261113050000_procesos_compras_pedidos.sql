begin;

create or replace function public.recibir_compra(
  p_compra_id uuid,
  p_usuario_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_compra public.compras%rowtype;
  v_detalle record;
  v_creados integer := 0;
  v_cantidad integer;
begin
  select * into v_compra from public.compras where id = p_compra_id for update;
  if not found then raise exception using errcode = '23503', message = 'La compra no existe.'; end if;
  if v_compra.estado = 'recibida' then return 0; end if;
  if v_compra.estado = 'cancelada' then raise exception using errcode = '23514', message = 'La compra está cancelada.'; end if;

  for v_detalle in select * from public.compra_detalles where compra_id = p_compra_id loop
    if v_detalle.variante_id is null then continue; end if;
    v_cantidad := greatest(1, round(v_detalle.cantidad)::integer);
    insert into public.lotes (
      codigo, origen, proveedor_id, variante_id, fecha_origen, fecha_recepcion,
      variedad, color, longitud_cm, calidad, cantidad_inicial, cantidad_disponible,
      costo_unitario, estado, observaciones, creado_por
    ) values (
      'COMPRA-' || left(replace(p_compra_id::text, '-', ''), 12) || '-' || v_detalle.id::text,
      'compra', v_compra.proveedor_id, v_detalle.variante_id, v_compra.fecha_compra,
      current_date, v_detalle.descripcion, 'Pendiente', 1, 'Pendiente', v_cantidad,
      v_cantidad, v_detalle.costo_unitario, 'cuarentena', 'Generado desde compra ' || v_compra.numero,
      p_usuario_id
    );
    v_creados := v_creados + 1;
  end loop;

  update public.compras set estado = 'recibida' where id = p_compra_id;
  return v_creados;
end;
$funcion$;

create or replace function public.reservar_pedido_fifo(
  p_pedido_id uuid,
  p_usuario_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_detalle record;
  v_lote public.lotes%rowtype;
  v_requerido integer;
  v_consumir integer;
  v_reservas integer := 0;
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception using errcode = '23503', message = 'El pedido no existe.';
  end if;

  for v_detalle in select * from public.pedido_detalles where pedido_id = p_pedido_id order by id loop
    if v_detalle.variante_id is null then continue; end if;
    v_requerido := v_detalle.cantidad;
    for v_lote in
      select lote.* from public.lotes lote
      where lote.variante_id = v_detalle.variante_id
        and lote.estado = 'liberado' and lote.cantidad_disponible > 0
      order by lote.fecha_origen, lote.fecha_creacion, lote.id
      for update
    loop
      exit when v_requerido <= 0;
      v_consumir := least(v_requerido, v_lote.cantidad_disponible);
      update public.lotes set cantidad_disponible = cantidad_disponible - v_consumir,
        estado = case when cantidad_disponible - v_consumir = 0 then 'agotado' else estado end,
        fecha_actualizacion = now() where id = v_lote.id;
      insert into public.reservas_pedido (pedido_detalle_id, lote_id, cantidad)
        values (v_detalle.id, v_lote.id, v_consumir);
      v_requerido := v_requerido - v_consumir;
      v_reservas := v_reservas + 1;
    end loop;
    if v_requerido > 0 then
      raise exception using errcode = '23514', message = 'No hay lotes liberados suficientes para reservar el pedido.';
    end if;
  end loop;
  update public.pedidos set estado = 'reservado', fecha_actualizacion = now() where id = p_pedido_id;
  return v_reservas;
end;
$funcion$;

grant execute on function public.recibir_compra(uuid, uuid) to service_role;
grant execute on function public.reservar_pedido_fifo(uuid, uuid) to service_role;

commit;
