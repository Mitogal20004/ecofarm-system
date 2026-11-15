begin;

create or replace function public.obtener_reporte_ventas(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_cliente_id uuid default null,
  p_serie text default null,
  p_usuario_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_serie text;
  v_resultado jsonb;
begin
  if not public.usuario_actual_tiene_permiso('reporte.ver') then
    raise exception using errcode = '42501', message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_fecha_desde is null or p_fecha_hasta is null or p_fecha_desde > p_fecha_hasta then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_serie := nullif(upper(btrim(p_serie)), '');
  if v_serie is not null and v_serie !~ '^[A-Z0-9]{1,8}$' then
    raise exception using errcode = '22023', message = 'Los parámetros proporcionados no son válidos.';
  end if;

  with ventas_filtradas as materialized (
    select
      venta.id,
      venta.estado,
      venta.total,
      (venta.fecha_confirmacion at time zone 'America/Guatemala')::date as fecha
    from public.ventas as venta
    where venta.fecha_confirmacion >= (p_fecha_desde::timestamp at time zone 'America/Guatemala')
      and venta.fecha_confirmacion < ((p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala')
      and (p_cliente_id is null or venta.cliente_id = p_cliente_id)
      and (v_serie is null or venta.serie_usuario_snapshot = v_serie)
      and (p_usuario_id is null or venta.usuario_creador = p_usuario_id)
  ),
  serie_diaria as (
    select
      venta.fecha,
      count(*) as operaciones_registradas,
      count(*) filter (where venta.estado = 'confirmada') as operaciones_confirmadas,
      count(*) filter (where venta.estado = 'anulada') as operaciones_anuladas,
      coalesce(sum(venta.total) filter (where venta.estado = 'confirmada'), 0::numeric) as ingresos_validos,
      coalesce(sum(venta.total) filter (where venta.estado = 'anulada'), 0::numeric) as monto_anulado
    from ventas_filtradas as venta
    group by venta.fecha
  ),
  productos_por_fecha as (
    select
      venta.fecha,
      jsonb_agg(
        jsonb_build_object(
          'sku', detalle.codigo_sku_snapshot,
          'nombre', detalle.producto_nombre_snapshot,
          'presentacion', detalle.presentacion_nombre_snapshot,
          'cantidad', detalle.cantidad_presentaciones
        )
        order by detalle.producto_nombre_snapshot, detalle.presentacion_nombre_snapshot
      ) as productos
    from ventas_filtradas as venta
    join public.venta_detalles as detalle on detalle.venta_id = venta.id
    where venta.estado = 'confirmada'
    group by venta.fecha
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'operaciones_registradas', count(*),
      'operaciones_confirmadas', count(*) filter (where venta.estado = 'confirmada'),
      'operaciones_anuladas', count(*) filter (where venta.estado = 'anulada'),
      'ingresos_validos', coalesce(sum(venta.total) filter (where venta.estado = 'confirmada'), 0::numeric),
      'monto_anulado', coalesce(sum(venta.total) filter (where venta.estado = 'anulada'), 0::numeric),
      'ticket_promedio', coalesce(
        round(
          sum(venta.total) filter (where venta.estado = 'confirmada') /
          nullif(count(*) filter (where venta.estado = 'confirmada'), 0), 2
        ), 0::numeric
      )
    ),
    'serie', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'fecha', serie.fecha,
            'operaciones_registradas', serie.operaciones_registradas,
            'operaciones_confirmadas', serie.operaciones_confirmadas,
            'operaciones_anuladas', serie.operaciones_anuladas,
            'ingresos_validos', serie.ingresos_validos,
            'monto_anulado', serie.monto_anulado,
            'productos', coalesce(productos.productos, '[]'::jsonb)
          )
          order by serie.fecha
        )
        from serie_diaria as serie
        left join productos_por_fecha as productos on productos.fecha = serie.fecha
      ),
      '[]'::jsonb
    ),
    'filtros', jsonb_build_object(
      'fecha_desde', p_fecha_desde,
      'fecha_hasta', p_fecha_hasta,
      'cliente_id', p_cliente_id,
      'serie', v_serie,
      'usuario_id', p_usuario_id
    )
  )
  into v_resultado
  from ventas_filtradas as venta;

  return v_resultado;
end;
$funcion$;

commit;
