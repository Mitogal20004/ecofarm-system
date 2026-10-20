begin;

-- Resume cada Venta una sola vez. Los Recibos, las Facturas FEL y los
-- detalles no participan en los importes para evitar duplicar ingresos.
create function public.obtener_reporte_ventas(
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
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_fecha_desde is null
    or p_fecha_hasta is null
    or p_fecha_desde > p_fecha_hasta
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_serie := nullif(upper(btrim(p_serie)), '');

  if v_serie is not null
    and v_serie !~ '^[A-Z0-9]{1,8}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  with ventas_filtradas as materialized (
    select
      venta.estado,
      venta.total,
      (
        venta.fecha_confirmacion at time zone 'America/Guatemala'
      )::date as fecha
    from public.ventas as venta
    where venta.fecha_confirmacion >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
      and venta.fecha_confirmacion < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
      and (p_cliente_id is null or venta.cliente_id = p_cliente_id)
      and (
        v_serie is null
        or venta.serie_usuario_snapshot = v_serie
      )
      and (
        p_usuario_id is null
        or venta.usuario_creador = p_usuario_id
      )
  ),
  serie_diaria as (
    select
      venta.fecha,
      count(*) as operaciones_registradas,
      count(*) filter (
        where venta.estado = 'confirmada'
      ) as operaciones_confirmadas,
      count(*) filter (
        where venta.estado = 'anulada'
      ) as operaciones_anuladas,
      coalesce(
        sum(venta.total) filter (
          where venta.estado = 'confirmada'
        ),
        0::numeric
      ) as ingresos_validos,
      coalesce(
        sum(venta.total) filter (
          where venta.estado = 'anulada'
        ),
        0::numeric
      ) as monto_anulado
    from ventas_filtradas as venta
    group by venta.fecha
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'operaciones_registradas', count(*),
      'operaciones_confirmadas', count(*) filter (
        where venta.estado = 'confirmada'
      ),
      'operaciones_anuladas', count(*) filter (
        where venta.estado = 'anulada'
      ),
      'ingresos_validos', coalesce(
        sum(venta.total) filter (
          where venta.estado = 'confirmada'
        ),
        0::numeric
      ),
      'monto_anulado', coalesce(
        sum(venta.total) filter (
          where venta.estado = 'anulada'
        ),
        0::numeric
      ),
      'ticket_promedio', coalesce(
        round(
          sum(venta.total) filter (
            where venta.estado = 'confirmada'
          ) / nullif(
            count(*) filter (
              where venta.estado = 'confirmada'
            ),
            0
          ),
          2
        ),
        0::numeric
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
            'monto_anulado', serie.monto_anulado
          )
          order by serie.fecha
        )
        from serie_diaria as serie
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

revoke execute
  on function public.obtener_reporte_ventas(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from public;
revoke execute
  on function public.obtener_reporte_ventas(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from anon;
revoke execute
  on function public.obtener_reporte_ventas(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from service_role;
grant execute
  on function public.obtener_reporte_ventas(
    date,
    date,
    uuid,
    text,
    uuid
  )
  to authenticated;


-- Las agrupaciones conservan los snapshots históricos. Si una variante o una
-- presentación cambió de descripción, cada identidad histórica queda separada.
create function public.listar_reporte_productos_vendidos(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_pagina integer default 1,
  p_limite integer default 20,
  p_variante_id uuid default null,
  p_presentacion_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_total bigint;
  v_productos jsonb;
begin
  if not public.usuario_actual_tiene_permiso('reporte.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_fecha_desde is null
    or p_fecha_hasta is null
    or p_fecha_desde > p_fecha_hasta
    or p_pagina is null
    or p_pagina < 1
    or p_limite is null
    or p_limite < 1
    or p_limite > 100
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  with productos_agrupados as materialized (
    select
      detalle.variante_id,
      detalle.presentacion_id,
      detalle.codigo_sku_snapshot as codigo_sku,
      detalle.color_snapshot as color,
      detalle.longitud_cm_snapshot as longitud_cm,
      detalle.clasificacion_snapshot as clasificacion,
      detalle.presentacion_codigo_snapshot as presentacion_codigo,
      detalle.presentacion_nombre_snapshot as presentacion_nombre,
      detalle.cantidad_manojos_presentacion,
      sum(detalle.cantidad_presentaciones)::bigint
        as unidades_comerciales,
      sum(detalle.cantidad_manojos) as manojos_equivalentes,
      sum(detalle.subtotal) as importe_vendido
    from public.venta_detalles as detalle
    join public.ventas as venta
      on venta.id = detalle.venta_id
    where venta.estado = 'confirmada'
      and venta.fecha_confirmacion >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
      and venta.fecha_confirmacion < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
      and (
        p_variante_id is null
        or detalle.variante_id = p_variante_id
      )
      and (
        p_presentacion_id is null
        or detalle.presentacion_id = p_presentacion_id
      )
    group by
      detalle.variante_id,
      detalle.presentacion_id,
      detalle.codigo_sku_snapshot,
      detalle.color_snapshot,
      detalle.longitud_cm_snapshot,
      detalle.clasificacion_snapshot,
      detalle.presentacion_codigo_snapshot,
      detalle.presentacion_nombre_snapshot,
      detalle.cantidad_manojos_presentacion
  ),
  pagina as (
    select producto.*
    from productos_agrupados as producto
    order by
      producto.importe_vendido desc,
      producto.manojos_equivalentes desc,
      producto.codigo_sku,
      producto.color,
      producto.longitud_cm,
      producto.clasificacion,
      producto.presentacion_codigo,
      producto.presentacion_nombre,
      producto.cantidad_manojos_presentacion,
      producto.variante_id,
      producto.presentacion_id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  )
  select
    (select count(*) from productos_agrupados),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'variante_id', producto.variante_id,
            'presentacion_id', producto.presentacion_id,
            'codigo_sku', producto.codigo_sku,
            'color', producto.color,
            'longitud_cm', producto.longitud_cm,
            'clasificacion', producto.clasificacion,
            'presentacion_codigo', producto.presentacion_codigo,
            'presentacion_nombre', producto.presentacion_nombre,
            'cantidad_manojos_presentacion',
              producto.cantidad_manojos_presentacion,
            'unidades_comerciales', producto.unidades_comerciales,
            'manojos_equivalentes', producto.manojos_equivalentes,
            'importe_vendido', producto.importe_vendido
          )
          order by
            producto.importe_vendido desc,
            producto.manojos_equivalentes desc,
            producto.codigo_sku,
            producto.color,
            producto.longitud_cm,
            producto.clasificacion,
            producto.presentacion_codigo,
            producto.presentacion_nombre,
            producto.cantidad_manojos_presentacion,
            producto.variante_id,
            producto.presentacion_id
        )
        from pagina as producto
      ),
      '[]'::jsonb
    )
  into
    v_total,
    v_productos;

  return jsonb_build_object(
    'productos', v_productos,
    'paginacion', jsonb_build_object(
      'pagina', p_pagina,
      'limite', p_limite,
      'total', v_total,
      'total_paginas', case
        when v_total = 0 then 0
        else (v_total + p_limite - 1) / p_limite
      end
    ),
    'filtros', jsonb_build_object(
      'fecha_desde', p_fecha_desde,
      'fecha_hasta', p_fecha_hasta,
      'variante_id', p_variante_id,
      'presentacion_id', p_presentacion_id
    )
  );
end;
$funcion$;

revoke execute
  on function public.listar_reporte_productos_vendidos(
    date,
    date,
    integer,
    integer,
    uuid,
    uuid
  )
  from public;
revoke execute
  on function public.listar_reporte_productos_vendidos(
    date,
    date,
    integer,
    integer,
    uuid,
    uuid
  )
  from anon;
revoke execute
  on function public.listar_reporte_productos_vendidos(
    date,
    date,
    integer,
    integer,
    uuid,
    uuid
  )
  from service_role;
grant execute
  on function public.listar_reporte_productos_vendidos(
    date,
    date,
    integer,
    integer,
    uuid,
    uuid
  )
  to authenticated;

commit;
