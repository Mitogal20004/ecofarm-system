begin;

-- El inventario usa manojos como única unidad física. Las presentaciones de
-- producto se emplean únicamente para calcular equivalencias comerciales.
create table public.inventario_existencias (
  variante_id uuid not null,
  stock_manojos integer not null default 0,
  stock_minimo_manojos integer not null default 0,
  fecha_actualizacion timestamptz not null default now(),
  constraint inventario_existencias_pk primary key (variante_id),
  constraint inventario_existencias_variante_fk
    foreign key (variante_id)
    references public.producto_variantes (id)
    on delete restrict,
  constraint inventario_existencias_stock_check
    check (stock_manojos >= 0),
  constraint inventario_existencias_stock_minimo_check
    check (stock_minimo_manojos >= 0)
);

create table public.movimientos_inventario (
  id uuid not null default gen_random_uuid(),
  variante_id uuid not null,
  tipo varchar(20) not null,
  variacion_manojos integer not null,
  saldo_anterior integer not null,
  saldo_posterior integer not null,
  motivo varchar(500) not null,
  origen varchar(40) not null default 'manual',
  referencia_id uuid,
  usuario_id uuid not null,
  fecha_movimiento timestamptz not null default now(),
  constraint movimientos_inventario_pk primary key (id),
  constraint movimientos_inventario_variante_fk
    foreign key (variante_id)
    references public.producto_variantes (id)
    on delete restrict,
  constraint movimientos_inventario_usuario_fk
    foreign key (usuario_id)
    references public.perfiles (id)
    on delete restrict,
  constraint movimientos_inventario_tipo_check
    check (tipo in ('entrada', 'salida', 'ajuste')),
  constraint movimientos_inventario_variacion_check
    check (
      (tipo = 'entrada' and variacion_manojos > 0)
      or (tipo = 'salida' and variacion_manojos < 0)
      or (tipo = 'ajuste' and variacion_manojos <> 0)
    ),
  constraint movimientos_inventario_saldos_check
    check (
      saldo_anterior >= 0
      and saldo_posterior >= 0
      and saldo_posterior = saldo_anterior + variacion_manojos
    ),
  constraint movimientos_inventario_motivo_check
    check (btrim(motivo) <> ''),
  constraint movimientos_inventario_origen_check
    check (
      origen = lower(btrim(origen))
      and origen ~ '^[a-z][a-z0-9_]*$'
    )
);

create index indice_movimientos_inventario_variante_fecha
  on public.movimientos_inventario (
    variante_id,
    fecha_movimiento desc,
    id desc
  );
create index indice_movimientos_inventario_tipo_fecha
  on public.movimientos_inventario (tipo, fecha_movimiento desc);
create index indice_movimientos_inventario_usuario_fecha
  on public.movimientos_inventario (usuario_id, fecha_movimiento desc);
create index indice_movimientos_inventario_referencia
  on public.movimientos_inventario (referencia_id)
  where referencia_id is not null;

alter table public.inventario_existencias enable row level security;
alter table public.movimientos_inventario enable row level security;


-- Las métricas representan la totalidad del resultado filtrado, no solo la
-- página solicitada. Una variante sin fila de existencia equivale a stock 0.
create function public.listar_inventario_snapdragon(
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
  v_presentaciones jsonb;
begin
  if not public.usuario_actual_tiene_permiso('inventario.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
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
      message = 'Los parámetros proporcionados no son válidos.';
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
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  with inventario_filtrado as (
    select
      variante.id as variante_id,
      coalesce(existencia.stock_manojos, 0) as stock_manojos,
      coalesce(existencia.stock_minimo_manojos, 0) as stock_minimo_manojos,
      case
        when coalesce(existencia.stock_manojos, 0) = 0 then 'sin_stock'
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
  )
  select
    count(*),
    jsonb_build_object(
      'total_manojos', coalesce(sum(stock_manojos), 0),
      'variantes_con_stock', count(*) filter (where stock_manojos > 0),
      'variantes_stock_bajo', count(*) filter (
        where estado_stock = 'stock_bajo'
      ),
      'variantes_sin_stock', count(*) filter (
        where estado_stock = 'sin_stock'
      )
    )
  into
    v_total,
    v_resumen
  from inventario_filtrado
  where v_estado_stock is null or estado_stock = v_estado_stock;

  with inventario_filtrado as (
    select
      variante.id as variante_id,
      variante.codigo_sku,
      variante.color,
      variante.longitud_cm,
      variante.clasificacion,
      variante.activo,
      coalesce(existencia.stock_manojos, 0) as stock_manojos,
      coalesce(existencia.stock_minimo_manojos, 0) as stock_minimo_manojos,
      existencia.fecha_actualizacion,
      case
        when coalesce(existencia.stock_manojos, 0) = 0 then 'sin_stock'
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
  pagina as (
    select *
    from inventario_filtrado
    where v_estado_stock is null or estado_stock = v_estado_stock
    order by codigo_sku, variante_id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variante_id', pagina.variante_id,
        'codigo_sku', pagina.codigo_sku,
        'color', pagina.color,
        'longitud_cm', pagina.longitud_cm,
        'clasificacion', pagina.clasificacion,
        'activo', pagina.activo,
        'stock_manojos', pagina.stock_manojos,
        'stock_minimo_manojos', pagina.stock_minimo_manojos,
        'fecha_actualizacion', pagina.fecha_actualizacion,
        'estado_stock', pagina.estado_stock
      )
      order by pagina.codigo_sku, pagina.variante_id
    ),
    '[]'::jsonb
  )
  into v_inventario
  from pagina;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', presentacion.id,
        'codigo', presentacion.codigo,
        'nombre', presentacion.nombre,
        'cantidad_manojos', presentacion.cantidad_manojos,
        'activo', presentacion.activo
      )
      order by presentacion.cantidad_manojos, presentacion.id
    ),
    '[]'::jsonb
  )
  into v_presentaciones
  from public.presentaciones_producto as presentacion;

  return jsonb_build_object(
    'inventario', v_inventario,
    'presentaciones', v_presentaciones,
    'resumen', v_resumen,
    'paginacion', jsonb_build_object(
      'pagina', p_pagina,
      'limite', p_limite,
      'total', v_total,
      'total_paginas', case
        when v_total = 0 then 0
        else (v_total + p_limite - 1) / p_limite
      end
    )
  );
end;
$funcion$;

revoke execute
  on function public.listar_inventario_snapdragon(
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
  on function public.listar_inventario_snapdragon(
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
  on function public.listar_inventario_snapdragon(
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
  on function public.listar_inventario_snapdragon(
    integer,
    integer,
    text,
    integer,
    text,
    text,
    boolean
  )
  to authenticated;


create function public.registrar_entrada_inventario(
  p_variante_id uuid,
  p_cantidad_manojos integer,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_variante_activa boolean;
  v_producto_activo boolean;
  v_existencia public.inventario_existencias%rowtype;
  v_movimiento public.movimientos_inventario%rowtype;
  v_motivo text;
  v_usuario_id uuid;
  v_saldo_posterior bigint;
begin
  if not public.usuario_actual_tiene_permiso(
    'inventario.registrar_movimiento'
  ) then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_variante_id is null
    or p_cantidad_manojos is null
    or p_cantidad_manojos <= 0
    or v_motivo is null
    or char_length(v_motivo) > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  -- Todas las escrituras bloquean primero la variante y luego la existencia.
  -- El orden común evita actualizaciones perdidas y bloqueos cruzados.
  select
    variante.activo,
    producto.activo
  into
    v_variante_activa,
    v_producto_activo
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = p_variante_id
    and producto.codigo = 'SNAPDRAGON'
  for update of variante;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  if not v_variante_activa or not v_producto_activo then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  insert into public.inventario_existencias (variante_id)
  values (p_variante_id)
  on conflict (variante_id) do nothing;

  select existencia.*
  into v_existencia
  from public.inventario_existencias as existencia
  where existencia.variante_id = p_variante_id
  for update;

  v_saldo_posterior :=
    v_existencia.stock_manojos::bigint + p_cantidad_manojos::bigint;

  if v_saldo_posterior > 2147483647 then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  update public.inventario_existencias as existencia
  set
    stock_manojos = v_saldo_posterior::integer,
    fecha_actualizacion = now()
  where existencia.variante_id = p_variante_id
  returning existencia.* into v_existencia;

  insert into public.movimientos_inventario (
    variante_id,
    tipo,
    variacion_manojos,
    saldo_anterior,
    saldo_posterior,
    motivo,
    origen,
    usuario_id
  )
  values (
    p_variante_id,
    'entrada',
    p_cantidad_manojos,
    v_existencia.stock_manojos - p_cantidad_manojos,
    v_existencia.stock_manojos,
    v_motivo,
    'manual',
    v_usuario_id
  )
  returning * into v_movimiento;

  return jsonb_build_object(
    'cambio', true,
    'existencia', jsonb_build_object(
      'variante_id', v_existencia.variante_id,
      'stock_manojos', v_existencia.stock_manojos,
      'stock_minimo_manojos', v_existencia.stock_minimo_manojos,
      'fecha_actualizacion', v_existencia.fecha_actualizacion
    ),
    'movimiento', jsonb_build_object(
      'id', v_movimiento.id,
      'tipo', v_movimiento.tipo,
      'variacion_manojos', v_movimiento.variacion_manojos,
      'saldo_anterior', v_movimiento.saldo_anterior,
      'saldo_posterior', v_movimiento.saldo_posterior,
      'motivo', v_movimiento.motivo,
      'origen', v_movimiento.origen,
      'fecha_movimiento', v_movimiento.fecha_movimiento
    )
  );
end;
$funcion$;

revoke execute
  on function public.registrar_entrada_inventario(uuid, integer, text)
  from public;
revoke execute
  on function public.registrar_entrada_inventario(uuid, integer, text)
  from anon;
revoke execute
  on function public.registrar_entrada_inventario(uuid, integer, text)
  from service_role;
grant execute
  on function public.registrar_entrada_inventario(uuid, integer, text)
  to authenticated;


create function public.registrar_salida_inventario(
  p_variante_id uuid,
  p_cantidad_manojos integer,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_variante_activa boolean;
  v_producto_activo boolean;
  v_existencia public.inventario_existencias%rowtype;
  v_movimiento public.movimientos_inventario%rowtype;
  v_motivo text;
  v_usuario_id uuid;
  v_saldo_anterior integer;
begin
  if not public.usuario_actual_tiene_permiso(
    'inventario.registrar_movimiento'
  ) then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_variante_id is null
    or p_cantidad_manojos is null
    or p_cantidad_manojos <= 0
    or v_motivo is null
    or char_length(v_motivo) > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select
    variante.activo,
    producto.activo
  into
    v_variante_activa,
    v_producto_activo
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = p_variante_id
    and producto.codigo = 'SNAPDRAGON'
  for update of variante;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  if not v_variante_activa or not v_producto_activo then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  insert into public.inventario_existencias (variante_id)
  values (p_variante_id)
  on conflict (variante_id) do nothing;

  select existencia.*
  into v_existencia
  from public.inventario_existencias as existencia
  where existencia.variante_id = p_variante_id
  for update;

  if p_cantidad_manojos > v_existencia.stock_manojos then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  v_saldo_anterior := v_existencia.stock_manojos;

  update public.inventario_existencias as existencia
  set
    stock_manojos = v_saldo_anterior - p_cantidad_manojos,
    fecha_actualizacion = now()
  where existencia.variante_id = p_variante_id
  returning existencia.* into v_existencia;

  insert into public.movimientos_inventario (
    variante_id,
    tipo,
    variacion_manojos,
    saldo_anterior,
    saldo_posterior,
    motivo,
    origen,
    usuario_id
  )
  values (
    p_variante_id,
    'salida',
    -p_cantidad_manojos,
    v_saldo_anterior,
    v_existencia.stock_manojos,
    v_motivo,
    'manual',
    v_usuario_id
  )
  returning * into v_movimiento;

  return jsonb_build_object(
    'cambio', true,
    'existencia', jsonb_build_object(
      'variante_id', v_existencia.variante_id,
      'stock_manojos', v_existencia.stock_manojos,
      'stock_minimo_manojos', v_existencia.stock_minimo_manojos,
      'fecha_actualizacion', v_existencia.fecha_actualizacion
    ),
    'movimiento', jsonb_build_object(
      'id', v_movimiento.id,
      'tipo', v_movimiento.tipo,
      'variacion_manojos', v_movimiento.variacion_manojos,
      'saldo_anterior', v_movimiento.saldo_anterior,
      'saldo_posterior', v_movimiento.saldo_posterior,
      'motivo', v_movimiento.motivo,
      'origen', v_movimiento.origen,
      'fecha_movimiento', v_movimiento.fecha_movimiento
    )
  );
end;
$funcion$;

revoke execute
  on function public.registrar_salida_inventario(uuid, integer, text)
  from public;
revoke execute
  on function public.registrar_salida_inventario(uuid, integer, text)
  from anon;
revoke execute
  on function public.registrar_salida_inventario(uuid, integer, text)
  from service_role;
grant execute
  on function public.registrar_salida_inventario(uuid, integer, text)
  to authenticated;


create function public.registrar_ajuste_inventario(
  p_variante_id uuid,
  p_conteo_fisico_manojos integer,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_existencia public.inventario_existencias%rowtype;
  v_movimiento public.movimientos_inventario%rowtype;
  v_motivo text;
  v_usuario_id uuid;
  v_saldo_anterior integer;
  v_variacion integer;
begin
  if not public.usuario_actual_tiene_permiso('inventario.ajustar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_variante_id is null
    or p_conteo_fisico_manojos is null
    or p_conteo_fisico_manojos < 0
    or v_motivo is null
    or char_length(v_motivo) > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  -- Los ajustes se permiten en variantes inactivas para poder conciliar una
  -- existencia física remanente; siguen requiriendo permiso y motivo.
  perform 1
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = p_variante_id
    and producto.codigo = 'SNAPDRAGON'
  for update of variante;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  insert into public.inventario_existencias (variante_id)
  values (p_variante_id)
  on conflict (variante_id) do nothing;

  select existencia.*
  into v_existencia
  from public.inventario_existencias as existencia
  where existencia.variante_id = p_variante_id
  for update;

  v_saldo_anterior := v_existencia.stock_manojos;
  v_variacion := p_conteo_fisico_manojos - v_saldo_anterior;

  if v_variacion = 0 then
    return jsonb_build_object(
      'cambio', false,
      'existencia', jsonb_build_object(
        'variante_id', v_existencia.variante_id,
        'stock_manojos', v_existencia.stock_manojos,
        'stock_minimo_manojos', v_existencia.stock_minimo_manojos,
        'fecha_actualizacion', v_existencia.fecha_actualizacion
      ),
      'movimiento', null
    );
  end if;

  update public.inventario_existencias as existencia
  set
    stock_manojos = p_conteo_fisico_manojos,
    fecha_actualizacion = now()
  where existencia.variante_id = p_variante_id
  returning existencia.* into v_existencia;

  insert into public.movimientos_inventario (
    variante_id,
    tipo,
    variacion_manojos,
    saldo_anterior,
    saldo_posterior,
    motivo,
    origen,
    usuario_id
  )
  values (
    p_variante_id,
    'ajuste',
    v_variacion,
    v_saldo_anterior,
    p_conteo_fisico_manojos,
    v_motivo,
    'manual',
    v_usuario_id
  )
  returning * into v_movimiento;

  return jsonb_build_object(
    'cambio', true,
    'existencia', jsonb_build_object(
      'variante_id', v_existencia.variante_id,
      'stock_manojos', v_existencia.stock_manojos,
      'stock_minimo_manojos', v_existencia.stock_minimo_manojos,
      'fecha_actualizacion', v_existencia.fecha_actualizacion
    ),
    'movimiento', jsonb_build_object(
      'id', v_movimiento.id,
      'tipo', v_movimiento.tipo,
      'variacion_manojos', v_movimiento.variacion_manojos,
      'saldo_anterior', v_movimiento.saldo_anterior,
      'saldo_posterior', v_movimiento.saldo_posterior,
      'motivo', v_movimiento.motivo,
      'origen', v_movimiento.origen,
      'fecha_movimiento', v_movimiento.fecha_movimiento
    )
  );
end;
$funcion$;

revoke execute
  on function public.registrar_ajuste_inventario(uuid, integer, text)
  from public;
revoke execute
  on function public.registrar_ajuste_inventario(uuid, integer, text)
  from anon;
revoke execute
  on function public.registrar_ajuste_inventario(uuid, integer, text)
  from service_role;
grant execute
  on function public.registrar_ajuste_inventario(uuid, integer, text)
  to authenticated;


create function public.actualizar_stock_minimo_inventario(
  p_variante_id uuid,
  p_stock_minimo_manojos integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_existencia public.inventario_existencias%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('inventario.ajustar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null
    or p_stock_minimo_manojos is null
    or p_stock_minimo_manojos < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  perform 1
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = p_variante_id
    and producto.codigo = 'SNAPDRAGON'
  for update of variante;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  insert into public.inventario_existencias (variante_id)
  values (p_variante_id)
  on conflict (variante_id) do nothing;

  select existencia.*
  into v_existencia
  from public.inventario_existencias as existencia
  where existencia.variante_id = p_variante_id
  for update;

  update public.inventario_existencias as existencia
  set
    stock_minimo_manojos = p_stock_minimo_manojos,
    fecha_actualizacion = now()
  where existencia.variante_id = p_variante_id
  returning existencia.* into v_existencia;

  return jsonb_build_object(
    'existencia', jsonb_build_object(
      'variante_id', v_existencia.variante_id,
      'stock_manojos', v_existencia.stock_manojos,
      'stock_minimo_manojos', v_existencia.stock_minimo_manojos,
      'fecha_actualizacion', v_existencia.fecha_actualizacion,
      'estado_stock', case
        when v_existencia.stock_manojos = 0 then 'sin_stock'
        when v_existencia.stock_manojos <= v_existencia.stock_minimo_manojos
          then 'stock_bajo'
        else 'disponible'
      end
    )
  );
end;
$funcion$;

revoke execute
  on function public.actualizar_stock_minimo_inventario(uuid, integer)
  from public;
revoke execute
  on function public.actualizar_stock_minimo_inventario(uuid, integer)
  from anon;
revoke execute
  on function public.actualizar_stock_minimo_inventario(uuid, integer)
  from service_role;
grant execute
  on function public.actualizar_stock_minimo_inventario(uuid, integer)
  to authenticated;


create function public.listar_movimientos_inventario(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_variante_id uuid default null,
  p_tipo text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
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
  v_total bigint;
  v_movimientos jsonb;
begin
  if not public.usuario_actual_tiene_permiso(
    'inventario.ver_movimientos'
  ) then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_pagina is null
    or p_pagina < 1
    or p_limite is null
    or p_limite < 1
    or p_limite > 100
    or (
      p_fecha_desde is not null
      and p_fecha_hasta is not null
      and p_fecha_desde > p_fecha_hasta
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_busqueda := nullif(
    btrim(regexp_replace(p_busqueda, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_tipo := nullif(lower(btrim(p_tipo)), '');

  if char_length(v_busqueda) > 150
    or (v_tipo is not null and v_tipo not in ('entrada', 'salida', 'ajuste'))
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.movimientos_inventario as movimiento
  join public.producto_variantes as variante
    on variante.id = movimiento.variante_id
  join public.productos as producto
    on producto.id = variante.producto_id
  where producto.codigo = 'SNAPDRAGON'
    and (p_variante_id is null or movimiento.variante_id = p_variante_id)
    and (v_tipo is null or movimiento.tipo = v_tipo)
    and (p_usuario_id is null or movimiento.usuario_id = p_usuario_id)
    and (
      p_fecha_desde is null
      or movimiento.fecha_movimiento >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      p_fecha_hasta is null
      or movimiento.fecha_movimiento < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      v_busqueda is null
      or strpos(lower(variante.codigo_sku), lower(v_busqueda)) > 0
      or strpos(variante.color_normalizado, lower(v_busqueda)) > 0
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'fecha_movimiento', pagina.fecha_movimiento,
        'variante', jsonb_build_object(
          'id', pagina.variante_id,
          'codigo_sku', pagina.codigo_sku,
          'color', pagina.color,
          'longitud_cm', pagina.longitud_cm,
          'clasificacion', pagina.clasificacion,
          'activo', pagina.variante_activa
        ),
        'tipo', pagina.tipo,
        'variacion_manojos', pagina.variacion_manojos,
        'saldo_anterior', pagina.saldo_anterior,
        'saldo_posterior', pagina.saldo_posterior,
        'motivo', pagina.motivo,
        'origen', pagina.origen,
        'referencia_id', pagina.referencia_id,
        'usuario', jsonb_build_object(
          'id', pagina.usuario_id,
          'nombre_completo', pagina.nombre_usuario
        )
      )
      order by pagina.fecha_movimiento desc, pagina.id desc
    ),
    '[]'::jsonb
  )
  into v_movimientos
  from (
    select
      movimiento.*,
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
      and (p_variante_id is null or movimiento.variante_id = p_variante_id)
      and (v_tipo is null or movimiento.tipo = v_tipo)
      and (p_usuario_id is null or movimiento.usuario_id = p_usuario_id)
      and (
        p_fecha_desde is null
        or movimiento.fecha_movimiento >= (
          p_fecha_desde::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        p_fecha_hasta is null
        or movimiento.fecha_movimiento < (
          (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        v_busqueda is null
        or strpos(lower(variante.codigo_sku), lower(v_busqueda)) > 0
        or strpos(variante.color_normalizado, lower(v_busqueda)) > 0
      )
    order by movimiento.fecha_movimiento desc, movimiento.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'movimientos', v_movimientos,
    'paginacion', jsonb_build_object(
      'pagina', p_pagina,
      'limite', p_limite,
      'total', v_total,
      'total_paginas', case
        when v_total = 0 then 0
        else (v_total + p_limite - 1) / p_limite
      end
    )
  );
end;
$funcion$;

revoke execute
  on function public.listar_movimientos_inventario(
    integer,
    integer,
    text,
    uuid,
    text,
    date,
    date,
    uuid
  )
  from public;
revoke execute
  on function public.listar_movimientos_inventario(
    integer,
    integer,
    text,
    uuid,
    text,
    date,
    date,
    uuid
  )
  from anon;
revoke execute
  on function public.listar_movimientos_inventario(
    integer,
    integer,
    text,
    uuid,
    text,
    date,
    date,
    uuid
  )
  from service_role;
grant execute
  on function public.listar_movimientos_inventario(
    integer,
    integer,
    text,
    uuid,
    text,
    date,
    date,
    uuid
  )
  to authenticated;

commit;
