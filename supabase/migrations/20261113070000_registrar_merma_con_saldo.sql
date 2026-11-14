begin;

create or replace function public.registrar_merma_operativa(
  p_lote_id uuid,
  p_insumo_id uuid,
  p_etapa varchar,
  p_motivo varchar,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_observaciones varchar,
  p_usuario_id uuid
)
returns uuid language plpgsql volatile security definer set search_path = '' as $funcion$
declare
  v_id uuid;
  v_lote public.lotes%rowtype;
begin
  if (p_lote_id is null) = (p_insumo_id is null) then
    raise exception using errcode = '22023', message = 'La merma debe referirse a un lote o a un insumo.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception using errcode = '22023', message = 'La cantidad de merma no es válida.';
  end if;

  if p_lote_id is not null then
    if p_cantidad <> trunc(p_cantidad) then
      raise exception using errcode = '22023', message = 'La merma de un lote debe expresarse en manojos enteros.';
    end if;
    select * into v_lote from public.lotes where id = p_lote_id for update;
    if not found or v_lote.cantidad_disponible < p_cantidad then
      raise exception using errcode = '23514', message = 'El lote no tiene saldo suficiente para registrar la merma.';
    end if;
    update public.lotes set cantidad_disponible = cantidad_disponible - p_cantidad,
      estado = case when cantidad_disponible - p_cantidad = 0 then 'agotado' else estado end,
      fecha_actualizacion = now() where id = p_lote_id;
    insert into public.movimientos_lotes (lote_id, tipo, cantidad, saldo_anterior, saldo_posterior, referencia_tipo, referencia_id, motivo, usuario_id)
      values (p_lote_id, 'merma', p_cantidad, v_lote.cantidad_disponible, v_lote.cantidad_disponible - p_cantidad, 'merma', null, p_motivo, p_usuario_id);
  end if;

  insert into public.mermas (lote_id, insumo_id, etapa, motivo, cantidad, costo_unitario, observaciones, registrado_por)
    values (p_lote_id, p_insumo_id, p_etapa, p_motivo, p_cantidad, coalesce(p_costo_unitario, 0), p_observaciones, p_usuario_id)
    returning id into v_id;
  return v_id;
end;
$funcion$;

grant execute on function public.registrar_merma_operativa(uuid, uuid, varchar, varchar, numeric, numeric, varchar, uuid) to service_role;

commit;
