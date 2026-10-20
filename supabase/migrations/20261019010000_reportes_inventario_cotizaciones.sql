begin;

-- El inventario es una fotografia del estado actual. Las variantes sin una
-- fila de existencia se consideran agotadas, con stock y stock minimo en cero.
create function public.obtener_reporte_inventario(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_longitud_cm integer default null,
  p_clasificacion text default null,
  p_estado_stock text default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_busqueda text;
  v_clasificacion text;
  v_estado_stock text;
  v_total bigint;
  v_resumen jsonb;
  v_inventario jsonb;
begin
  if not public.usuario_actual_tiene_permiso('reporte.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  if p_pagina is null
    or p_pagina < 1
    or p_limite is null
    or p_limite < 1
    or p_limite > 100
    or (p_longitud_cm is not null and p_longitud_cm <= 0)
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  v_busqueda := nullif(
    btrim(regexp_replace(p_busqueda, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_clasificacion := nullif(lower(btrim(p_clasificacion)), '');
  v_estado_stock := nullif(lower(btrim(p_estado_stock)), '');

  if char_length(v_busqueda) > 150
    or (
      v_clasificacion is not null
      and v_clasificacion not in ('normal', 'completa', 'premium')
    )
    or (
      v_estado_stock is not null
      and v_estado_stock not in ('sin_stock', 'stock_bajo', 'disponible')
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  with inventario_filtrado as materialized (
    select
      variante.id as variante_id,
      variante.codigo_sku,
      variante.color,
      variante.longitud_cm,
      variante.clasificacion,
      variante.activo,
      coalesce(existencia.stock_manojos, 0) as stock_manojos,
      coalesce(
        existencia.stock_minimo_manojos,
        0
      ) as stock_minimo_manojos,
      existencia.fecha_actualizacion,
      case
        when coalesce(existencia.stock_manojos, 0) = 0
          then 'sin_stock'
        when coalesce(existencia.stock_manojos, 0)
          <= coalesce(existencia.stock_minimo_manojos, 0)
          then 'stock_bajo'
        else 'disponible'
      end as estado_stock
    from public.producto_variantes as variante
    join public.productos as producto
      on producto.id = variante.producto_id
    left join public.inventario_existencias as existencia
      on existencia.variante_id = variante.id
    where producto.codigo = 'SNAPDRAGON'
      and (p_activo is null or variante.activo = p_activo)
      and (p_longitud_cm is null or variante.longitud_cm = p_longitud_cm)
      and (
        v_clasificacion is null
        or variante.clasificacion = v_clasificacion
      )
      and (
        v_busqueda is null
        or strpos(lower(variante.codigo_sku), lower(v_busqueda)) > 0
        or strpos(variante.color_normalizado, lower(v_busqueda)) > 0
      )
  ),
  inventario_seleccionado as materialized (
    select inventario.*
    from inventario_filtrado as inventario
    where v_estado_stock is null
      or inventario.estado_stock = v_estado_stock
  ),
  pagina as (
    select inventario.*
    from inventario_seleccionado as inventario
    order by inventario.codigo_sku, inventario.variante_id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  )
  select
    (select count(*) from inventario_seleccionado),
    (
      select jsonb_build_object(
        'total_manojos', coalesce(sum(inventario.stock_manojos), 0),
        'variantes_disponibles', count(*) filter (
          where inventario.estado_stock = 'disponible'
        ),
        'variantes_stock_bajo', count(*) filter (
          where inventario.estado_stock = 'stock_bajo'
        ),
        'variantes_agotadas', count(*) filter (
          where inventario.estado_stock = 'sin_stock'
        )
      )
      from inventario_seleccionado as inventario
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'variante_id', inventario.variante_id,
            'codigo_sku', inventario.codigo_sku,
            'color', inventario.color,
            'longitud_cm', inventario.longitud_cm,
            'clasificacion', inventario.clasificacion,
            'activo', inventario.activo,
            'stock_manojos', inventario.stock_manojos,
            'stock_minimo_manojos',
              inventario.stock_minimo_manojos,
            'estado_stock', inventario.estado_stock,
            'fecha_actualizacion', inventario.fecha_actualizacion
          )
          order by inventario.codigo_sku, inventario.variante_id
        )
        from pagina as inventario
      ),
      '[]'::jsonb
    )
  into
    v_total,
    v_resumen,
    v_inventario;

  return jsonb_build_object(
    'resumen', v_resumen,
    'inventario', v_inventario,
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
      'busqueda', v_busqueda,
      'longitud_cm', p_longitud_cm,
      'clasificacion', v_clasificacion,
      'estado_stock', v_estado_stock,
      'activo', p_activo
    )
  );
end;
$funcion$;

revoke execute
  on function public.obtener_reporte_inventario(
    integer,
    integer,
    text,
    integer,
    text,
    text,
    boolean
  )
  from public;
revoke execute
  on function public.obtener_reporte_inventario(
    integer,
    integer,
    text,
    integer,
    text,
    text,
    boolean
  )
  from anon;
revoke execute
  on function public.obtener_reporte_inventario(
    integer,
    integer,
    text,
    integer,
    text,
    text,
    boolean
  )
  from service_role;
grant execute
  on function public.obtener_reporte_inventario(
    integer,
    integer,
    text,
    integer,
    text,
    text,
    boolean
  )
  to authenticated;


-- Los grupos del resumen se basan en la combinacion real de tipo y origen.
-- Los ajustes nunca se clasifican como entradas o salidas comerciales.
create function public.obtener_reporte_movimientos_inventario(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_variante_id uuid default null,
  p_tipo text default null,
  p_origen text default null,
  p_usuario_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_busqueda text;
  v_tipo text;
  v_origen text;
  v_total bigint;
  v_resumen jsonb;
  v_movimientos jsonb;
begin
  if not public.usuario_actual_tiene_permiso('reporte.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
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
      message = 'Los parametros proporcionados no son validos.';
  end if;

  v_busqueda := nullif(
    btrim(regexp_replace(p_busqueda, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_tipo := nullif(lower(btrim(p_tipo)), '');
  v_origen := nullif(lower(btrim(p_origen)), '');

  if char_length(v_busqueda) > 150
    or (v_tipo is not null and v_tipo not in ('entrada', 'salida', 'ajuste'))
    or (
      v_origen is not null
      and (
        char_length(v_origen) > 40
        or v_origen !~ '^[a-z][a-z0-9_]*$'
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  with movimientos_filtrados as materialized (
    select
      movimiento.id,
      movimiento.variante_id,
      movimiento.tipo,
      movimiento.variacion_manojos,
      movimiento.saldo_anterior,
      movimiento.saldo_posterior,
      movimiento.motivo,
      movimiento.origen,
      movimiento.referencia_id,
      movimiento.usuario_id,
      movimiento.fecha_movimiento,
      variante.codigo_sku,
      variante.color,
      variante.longitud_cm,
      variante.clasificacion,
      variante.activo as variante_activa,
      perfil.nombre_completo as nombre_usuario
    from public.movimientos_inventario as movimiento
    join public.producto_variantes as variante
      on variante.id = movimiento.variante_id
    join public.productos as producto
      on producto.id = variante.producto_id
    join public.perfiles as perfil
      on perfil.id = movimiento.usuario_id
    where producto.codigo = 'SNAPDRAGON'
      and movimiento.fecha_movimiento >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
      and movimiento.fecha_movimiento < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
      and (
        p_variante_id is null
        or movimiento.variante_id = p_variante_id
      )
      and (v_tipo is null or movimiento.tipo = v_tipo)
      and (v_origen is null or movimiento.origen = v_origen)
      and (
        p_usuario_id is null
        or movimiento.usuario_id = p_usuario_id
      )
      and (
        v_busqueda is null
        or strpos(lower(variante.codigo_sku), lower(v_busqueda)) > 0
        or strpos(variante.color_normalizado, lower(v_busqueda)) > 0
      )
  ),
  pagina as (
    select movimiento.*
    from movimientos_filtrados as movimiento
    order by movimiento.fecha_movimiento desc, movimiento.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  )
  select
    (select count(*) from movimientos_filtrados),
    (
      select jsonb_build_object(
        'entradas_manuales', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'entrada'
              and movimiento.origen = 'manual'
          ),
          'manojos', coalesce(
            sum(movimiento.variacion_manojos) filter (
              where movimiento.tipo = 'entrada'
                and movimiento.origen = 'manual'
            ),
            0::bigint
          )
        ),
        'salidas_manuales', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'salida'
              and movimiento.origen = 'manual'
          ),
          'manojos', coalesce(
            sum(-movimiento.variacion_manojos::bigint) filter (
              where movimiento.tipo = 'salida'
                and movimiento.origen = 'manual'
            ),
            0::bigint
          )
        ),
        'salidas_ventas', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'salida'
              and movimiento.origen = 'venta'
          ),
          'manojos', coalesce(
            sum(-movimiento.variacion_manojos::bigint) filter (
              where movimiento.tipo = 'salida'
                and movimiento.origen = 'venta'
            ),
            0::bigint
          )
        ),
        'reintegros_anulaciones', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'entrada'
              and movimiento.origen = 'anulacion_venta'
          ),
          'manojos', coalesce(
            sum(movimiento.variacion_manojos) filter (
              where movimiento.tipo = 'entrada'
                and movimiento.origen = 'anulacion_venta'
            ),
            0::bigint
          )
        ),
        'ajustes_positivos', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'ajuste'
              and movimiento.variacion_manojos > 0
          ),
          'manojos', coalesce(
            sum(movimiento.variacion_manojos) filter (
              where movimiento.tipo = 'ajuste'
                and movimiento.variacion_manojos > 0
            ),
            0::bigint
          )
        ),
        'ajustes_negativos', jsonb_build_object(
          'movimientos', count(*) filter (
            where movimiento.tipo = 'ajuste'
              and movimiento.variacion_manojos < 0
          ),
          'manojos', coalesce(
            sum(-movimiento.variacion_manojos::bigint) filter (
              where movimiento.tipo = 'ajuste'
                and movimiento.variacion_manojos < 0
            ),
            0::bigint
          )
        ),
        'movimiento_neto_manojos', coalesce(
          sum(movimiento.variacion_manojos),
          0::bigint
        )
      )
      from movimientos_filtrados as movimiento
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', movimiento.id,
            'fecha_movimiento', movimiento.fecha_movimiento,
            'variante', jsonb_build_object(
              'id', movimiento.variante_id,
              'codigo_sku', movimiento.codigo_sku,
              'color', movimiento.color,
              'longitud_cm', movimiento.longitud_cm,
              'clasificacion', movimiento.clasificacion,
              'activo', movimiento.variante_activa
            ),
            'tipo', movimiento.tipo,
            'variacion_manojos', movimiento.variacion_manojos,
            'saldo_anterior', movimiento.saldo_anterior,
            'saldo_posterior', movimiento.saldo_posterior,
            'motivo', movimiento.motivo,
            'origen', movimiento.origen,
            'referencia_id', movimiento.referencia_id,
            'usuario', jsonb_build_object(
              'id', movimiento.usuario_id,
              'nombre_completo', movimiento.nombre_usuario
            )
          )
          order by movimiento.fecha_movimiento desc, movimiento.id desc
        )
        from pagina as movimiento
      ),
      '[]'::jsonb
    )
  into
    v_total,
    v_resumen,
    v_movimientos;

  return jsonb_build_object(
    'resumen', v_resumen,
    'movimientos', v_movimientos,
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
      'busqueda', v_busqueda,
      'variante_id', p_variante_id,
      'tipo', v_tipo,
      'origen', v_origen,
      'usuario_id', p_usuario_id
    )
  );
end;
$funcion$;

revoke execute
  on function public.obtener_reporte_movimientos_inventario(
    date,
    date,
    integer,
    integer,
    text,
    uuid,
    text,
    text,
    uuid
  )
  from public;
revoke execute
  on function public.obtener_reporte_movimientos_inventario(
    date,
    date,
    integer,
    integer,
    text,
    uuid,
    text,
    text,
    uuid
  )
  from anon;
revoke execute
  on function public.obtener_reporte_movimientos_inventario(
    date,
    date,
    integer,
    integer,
    text,
    uuid,
    text,
    text,
    uuid
  )
  from service_role;
grant execute
  on function public.obtener_reporte_movimientos_inventario(
    date,
    date,
    integer,
    integer,
    text,
    uuid,
    text,
    text,
    uuid
  )
  to authenticated;


-- Los importes son valores cotizados, no ingresos. El periodo se clasifica
-- exclusivamente por fecha_creacion y por el estado actual de cada registro.
create function public.obtener_reporte_cotizaciones(
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
  v_total bigint;
  v_borradores bigint;
  v_emitidas bigint;
  v_convertidas bigint;
  v_anuladas bigint;
  v_valor_borradores numeric;
  v_valor_emitidas numeric;
  v_valor_convertidas numeric;
  v_valor_anuladas numeric;
begin
  if not public.usuario_actual_tiene_permiso('reporte.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta accion.';
  end if;

  if p_fecha_desde is null
    or p_fecha_hasta is null
    or p_fecha_desde > p_fecha_hasta
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  v_serie := nullif(upper(btrim(p_serie)), '');

  if v_serie is not null
    and v_serie !~ '^[A-Z0-9]{1,8}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parametros proporcionados no son validos.';
  end if;

  select
    count(*),
    count(*) filter (where cotizacion.estado = 'borrador'),
    count(*) filter (where cotizacion.estado = 'emitida'),
    count(*) filter (where cotizacion.estado = 'convertida'),
    count(*) filter (where cotizacion.estado = 'anulada'),
    coalesce(
      sum(cotizacion.total) filter (
        where cotizacion.estado = 'borrador'
      ),
      0::numeric
    ),
    coalesce(
      sum(cotizacion.total) filter (
        where cotizacion.estado = 'emitida'
      ),
      0::numeric
    ),
    coalesce(
      sum(cotizacion.total) filter (
        where cotizacion.estado = 'convertida'
      ),
      0::numeric
    ),
    coalesce(
      sum(cotizacion.total) filter (
        where cotizacion.estado = 'anulada'
      ),
      0::numeric
    )
  into
    v_total,
    v_borradores,
    v_emitidas,
    v_convertidas,
    v_anuladas,
    v_valor_borradores,
    v_valor_emitidas,
    v_valor_convertidas,
    v_valor_anuladas
  from public.cotizaciones as cotizacion
  where cotizacion.fecha_creacion >= (
      p_fecha_desde::timestamp at time zone 'America/Guatemala'
    )
    and cotizacion.fecha_creacion < (
      (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
    )
    and (p_cliente_id is null or cotizacion.cliente_id = p_cliente_id)
    and (
      v_serie is null
      or cotizacion.serie_usuario_snapshot = v_serie
    )
    and (
      p_usuario_id is null
      or cotizacion.usuario_creador = p_usuario_id
    );

  return jsonb_build_object(
    'resumen', jsonb_build_object(
      'total_cotizaciones', v_total,
      'borradores', v_borradores,
      'emitidas', v_emitidas,
      'convertidas', v_convertidas,
      'anuladas', v_anuladas
    ),
    'estados', jsonb_build_array(
      jsonb_build_object(
        'estado', 'borrador',
        'cantidad', v_borradores,
        'valor_cotizado', v_valor_borradores,
        'porcentaje_cotizaciones', coalesce(
          round(
            v_borradores::numeric * 100
            / nullif(v_total::numeric, 0),
            2
          ),
          0::numeric
        )
      ),
      jsonb_build_object(
        'estado', 'emitida',
        'cantidad', v_emitidas,
        'valor_cotizado', v_valor_emitidas,
        'porcentaje_cotizaciones', coalesce(
          round(
            v_emitidas::numeric * 100
            / nullif(v_total::numeric, 0),
            2
          ),
          0::numeric
        )
      ),
      jsonb_build_object(
        'estado', 'convertida',
        'cantidad', v_convertidas,
        'valor_cotizado', v_valor_convertidas,
        'porcentaje_cotizaciones', coalesce(
          round(
            v_convertidas::numeric * 100
            / nullif(v_total::numeric, 0),
            2
          ),
          0::numeric
        )
      ),
      jsonb_build_object(
        'estado', 'anulada',
        'cantidad', v_anuladas,
        'valor_cotizado', v_valor_anuladas,
        'porcentaje_cotizaciones', coalesce(
          round(
            v_anuladas::numeric * 100
            / nullif(v_total::numeric, 0),
            2
          ),
          0::numeric
        )
      )
    ),
    'filtros', jsonb_build_object(
      'fecha_desde', p_fecha_desde,
      'fecha_hasta', p_fecha_hasta,
      'cliente_id', p_cliente_id,
      'serie', v_serie,
      'usuario_id', p_usuario_id,
      'campo_fecha', 'fecha_creacion'
    )
  );
end;
$funcion$;

revoke execute
  on function public.obtener_reporte_cotizaciones(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from public;
revoke execute
  on function public.obtener_reporte_cotizaciones(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from anon;
revoke execute
  on function public.obtener_reporte_cotizaciones(
    date,
    date,
    uuid,
    text,
    uuid
  )
  from service_role;
grant execute
  on function public.obtener_reporte_cotizaciones(
    date,
    date,
    uuid,
    text,
    uuid
  )
  to authenticated;

commit;
