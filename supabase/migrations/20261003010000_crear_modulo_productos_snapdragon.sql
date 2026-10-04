begin;

-- E-farm comercializa un único producto base. Sus diferencias comerciales se
-- modelan como variantes y sus unidades de venta como presentaciones.
create table public.productos (
  id uuid not null default gen_random_uuid(),
  codigo varchar(40) not null,
  nombre varchar(120) not null,
  descripcion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint productos_pk primary key (id),
  constraint productos_codigo_unico unique (codigo),
  constraint productos_nombre_unico unique (nombre),
  constraint productos_codigo_check
    check (
      codigo = upper(btrim(codigo))
      and codigo ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  constraint productos_nombre_check
    check (btrim(nombre) <> '')
);

create table public.producto_variantes (
  id uuid not null default gen_random_uuid(),
  producto_id uuid not null,
  codigo_sku varchar(80) not null,
  color varchar(80) not null,
  color_normalizado varchar(80) not null,
  longitud_cm integer not null,
  clasificacion varchar(20) not null,
  observaciones text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint producto_variantes_pk primary key (id),
  constraint producto_variantes_producto_fk
    foreign key (producto_id)
    references public.productos (id)
    on delete restrict,
  constraint producto_variantes_sku_unico unique (codigo_sku),
  constraint producto_variantes_combinacion_unica
    unique (producto_id, color_normalizado, longitud_cm, clasificacion),
  constraint producto_variantes_sku_check
    check (
      codigo_sku = upper(btrim(codigo_sku))
      and codigo_sku ~ '^[A-Z0-9][A-Z0-9._-]{1,78}[A-Z0-9]$'
    ),
  constraint producto_variantes_color_check
    check (
      btrim(color) <> ''
      and color_normalizado = lower(
        btrim(regexp_replace(color, '[[:space:]]+', ' ', 'g'))
      )
    ),
  constraint producto_variantes_longitud_check
    check (longitud_cm > 0),
  constraint producto_variantes_clasificacion_check
    check (clasificacion in ('normal', 'completa', 'premium')),
  constraint producto_variantes_observaciones_check
    check (observaciones is null or char_length(observaciones) <= 500)
);

create table public.presentaciones_producto (
  id uuid not null default gen_random_uuid(),
  codigo varchar(30) not null,
  nombre varchar(80) not null,
  cantidad_manojos integer not null,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint presentaciones_producto_pk primary key (id),
  constraint presentaciones_producto_codigo_unico unique (codigo),
  constraint presentaciones_producto_nombre_unico unique (nombre),
  constraint presentaciones_producto_cantidad_unica unique (cantidad_manojos),
  constraint presentaciones_producto_codigo_check
    check (
      codigo = lower(btrim(codigo))
      and codigo ~ '^[a-z0-9][a-z0-9_]*$'
    ),
  constraint presentaciones_producto_nombre_check
    check (btrim(nombre) <> ''),
  constraint presentaciones_producto_cantidad_check
    check (cantidad_manojos > 0)
);

create table public.precios_producto (
  id uuid not null default gen_random_uuid(),
  variante_id uuid not null,
  presentacion_id uuid not null,
  precio numeric(12, 2) not null,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  usuario_registro uuid not null,
  fecha_creacion timestamptz not null default now(),
  constraint precios_producto_pk primary key (id),
  constraint precios_producto_variante_fk
    foreign key (variante_id)
    references public.producto_variantes (id)
    on delete restrict,
  constraint precios_producto_presentacion_fk
    foreign key (presentacion_id)
    references public.presentaciones_producto (id)
    on delete restrict,
  constraint precios_producto_usuario_fk
    foreign key (usuario_registro)
    references public.perfiles (id)
    on delete restrict,
  constraint precios_producto_precio_check
    check (precio > 0),
  constraint precios_producto_vigencia_check
    check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create index indice_producto_variantes_producto
  on public.producto_variantes (producto_id);
create index indice_producto_variantes_filtros
  on public.producto_variantes (activo, clasificacion, longitud_cm);
create index indice_precios_producto_historial
  on public.precios_producto (
    variante_id,
    presentacion_id,
    vigente_desde desc
  );
create index indice_precios_producto_presentacion
  on public.precios_producto (presentacion_id);
create index indice_precios_producto_usuario
  on public.precios_producto (usuario_registro);
create unique index precios_producto_vigente_unico
  on public.precios_producto (variante_id, presentacion_id)
  where vigente_hasta is null;

alter table public.productos enable row level security;
alter table public.producto_variantes enable row level security;
alter table public.presentaciones_producto enable row level security;
alter table public.precios_producto enable row level security;

-- Datos estructurales fijos del negocio. No se insertan variantes ni precios.
insert into public.productos (
  codigo,
  nombre,
  descripcion
)
values (
  'SNAPDRAGON',
  'Snapdragon',
  'Producto base comercializado por E-farm.'
)
on conflict (codigo) do nothing;

insert into public.presentaciones_producto (
  codigo,
  nombre,
  cantidad_manojos
)
values
  ('manojo', 'Manojo', 1),
  ('caja_10', 'Caja 10', 10),
  ('caja_20', 'Caja 20', 20),
  ('caja_30', 'Caja 30', 30)
on conflict (codigo) do nothing;


-- Lista paginada de variantes de Snapdragon con su matriz de precios vigente.
create function public.listar_variantes_snapdragon(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_longitud_cm integer default null,
  p_clasificacion text default null,
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
  v_producto jsonb;
  v_total bigint;
  v_variantes jsonb;
begin
  if not public.usuario_actual_tiene_permiso('producto.ver') then
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

  if char_length(v_busqueda) > 150
    or (
      v_clasificacion is not null
      and v_clasificacion not in ('normal', 'completa', 'premium')
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select jsonb_build_object(
    'id', producto.id,
    'codigo', producto.codigo,
    'nombre', producto.nombre,
    'descripcion', producto.descripcion,
    'activo', producto.activo
  )
  into v_producto
  from public.productos as producto
  where producto.codigo = 'SNAPDRAGON';

  if v_producto is null then
    raise exception using
      errcode = 'P0002',
      message = 'El producto solicitado no existe.';
  end if;

  select count(*)
  into v_total
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
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
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'producto_id', pagina.producto_id,
        'codigo_sku', pagina.codigo_sku,
        'color', pagina.color,
        'longitud_cm', pagina.longitud_cm,
        'clasificacion', pagina.clasificacion,
        'observaciones', pagina.observaciones,
        'activo', pagina.activo,
        'fecha_creacion', pagina.fecha_creacion,
        'fecha_actualizacion', pagina.fecha_actualizacion,
        'precios', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', precio.id,
                'presentacion_id', presentacion.id,
                'codigo_presentacion', presentacion.codigo,
                'presentacion', presentacion.nombre,
                'cantidad_manojos', presentacion.cantidad_manojos,
                'precio', precio.precio,
                'vigente_desde', precio.vigente_desde
              )
              order by presentacion.cantidad_manojos
            )
            from public.precios_producto as precio
            join public.presentaciones_producto as presentacion
              on presentacion.id = precio.presentacion_id
            where precio.variante_id = pagina.id
              and precio.vigente_hasta is null
          ),
          '[]'::jsonb
        )
      )
      order by pagina.codigo_sku, pagina.id
    ),
    '[]'::jsonb
  )
  into v_variantes
  from (
    select variante.*
    from public.producto_variantes as variante
    join public.productos as producto
      on producto.id = variante.producto_id
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
    order by variante.codigo_sku, variante.id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'producto', v_producto,
    'variantes', v_variantes,
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
  on function public.listar_variantes_snapdragon(
    integer,
    integer,
    text,
    integer,
    text,
    boolean
  )
  from public;
revoke execute
  on function public.listar_variantes_snapdragon(
    integer,
    integer,
    text,
    integer,
    text,
    boolean
  )
  from anon;
revoke execute
  on function public.listar_variantes_snapdragon(
    integer,
    integer,
    text,
    integer,
    text,
    boolean
  )
  from service_role;
grant execute
  on function public.listar_variantes_snapdragon(
    integer,
    integer,
    text,
    integer,
    text,
    boolean
  )
  to authenticated;


create function public.listar_presentaciones_producto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_presentaciones jsonb;
begin
  if not public.usuario_actual_tiene_permiso('producto.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

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

  return jsonb_build_object('presentaciones', v_presentaciones);
end;
$funcion$;

revoke execute on function public.listar_presentaciones_producto()
  from public;
revoke execute on function public.listar_presentaciones_producto()
  from anon;
revoke execute on function public.listar_presentaciones_producto()
  from service_role;
grant execute on function public.listar_presentaciones_producto()
  to authenticated;


create function public.crear_variante_snapdragon(
  p_codigo_sku text,
  p_color text,
  p_longitud_cm integer,
  p_clasificacion text,
  p_observaciones text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_producto_id uuid;
  v_codigo_sku text;
  v_color text;
  v_color_normalizado text;
  v_clasificacion text;
  v_observaciones text;
  v_variante public.producto_variantes%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('producto.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_codigo_sku := upper(btrim(p_codigo_sku));
  v_color := initcap(lower(nullif(
    btrim(regexp_replace(p_color, '[[:space:]]+', ' ', 'g')),
    ''
  )));
  v_color_normalizado := lower(v_color);
  v_clasificacion := lower(btrim(p_clasificacion));
  v_observaciones := nullif(
    btrim(regexp_replace(p_observaciones, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if v_codigo_sku is null
    or v_codigo_sku !~ '^[A-Z0-9][A-Z0-9._-]{1,78}[A-Z0-9]$'
    or v_color is null
    or char_length(v_color) > 80
    or p_longitud_cm is null
    or p_longitud_cm <= 0
    or v_clasificacion is null
    or v_clasificacion not in ('normal', 'completa', 'premium')
    or char_length(v_observaciones) > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select producto.id
  into v_producto_id
  from public.productos as producto
  where producto.codigo = 'SNAPDRAGON'
    and producto.activo is true
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  insert into public.producto_variantes (
    producto_id,
    codigo_sku,
    color,
    color_normalizado,
    longitud_cm,
    clasificacion,
    observaciones
  )
  values (
    v_producto_id,
    v_codigo_sku,
    v_color,
    v_color_normalizado,
    p_longitud_cm,
    v_clasificacion,
    v_observaciones
  )
  returning * into v_variante;

  return jsonb_build_object(
    'variante', jsonb_build_object(
      'id', v_variante.id,
      'producto_id', v_variante.producto_id,
      'codigo_sku', v_variante.codigo_sku,
      'color', v_variante.color,
      'longitud_cm', v_variante.longitud_cm,
      'clasificacion', v_variante.clasificacion,
      'observaciones', v_variante.observaciones,
      'activo', v_variante.activo,
      'fecha_creacion', v_variante.fecha_creacion,
      'fecha_actualizacion', v_variante.fecha_actualizacion
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'La variante solicitada ya existe.';
end;
$funcion$;

revoke execute
  on function public.crear_variante_snapdragon(text, text, integer, text, text)
  from public;
revoke execute
  on function public.crear_variante_snapdragon(text, text, integer, text, text)
  from anon;
revoke execute
  on function public.crear_variante_snapdragon(text, text, integer, text, text)
  from service_role;
grant execute
  on function public.crear_variante_snapdragon(text, text, integer, text, text)
  to authenticated;


create function public.obtener_detalle_variante_producto(
  p_variante_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_producto jsonb;
  v_variante jsonb;
  v_precios jsonb;
begin
  if not public.usuario_actual_tiene_permiso('producto.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select
    jsonb_build_object(
      'id', producto.id,
      'codigo', producto.codigo,
      'nombre', producto.nombre,
      'descripcion', producto.descripcion,
      'activo', producto.activo
    ),
    jsonb_build_object(
      'id', variante.id,
      'producto_id', variante.producto_id,
      'codigo_sku', variante.codigo_sku,
      'color', variante.color,
      'longitud_cm', variante.longitud_cm,
      'clasificacion', variante.clasificacion,
      'observaciones', variante.observaciones,
      'activo', variante.activo,
      'fecha_creacion', variante.fecha_creacion,
      'fecha_actualizacion', variante.fecha_actualizacion
    )
  into
    v_producto,
    v_variante
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = p_variante_id
    and producto.codigo = 'SNAPDRAGON';

  if v_variante is null then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', precio.id,
        'presentacion_id', presentacion.id,
        'codigo_presentacion', presentacion.codigo,
        'presentacion', presentacion.nombre,
        'cantidad_manojos', presentacion.cantidad_manojos,
        'presentacion_activa', presentacion.activo,
        'precio', precio.precio,
        'vigente_desde', precio.vigente_desde
      )
      order by presentacion.cantidad_manojos, presentacion.id
    ),
    '[]'::jsonb
  )
  into v_precios
  from public.presentaciones_producto as presentacion
  left join public.precios_producto as precio
    on precio.presentacion_id = presentacion.id
    and precio.variante_id = p_variante_id
    and precio.vigente_hasta is null;

  return jsonb_build_object(
    'producto', v_producto,
    'variante', v_variante,
    'precios', v_precios
  );
end;
$funcion$;

revoke execute
  on function public.obtener_detalle_variante_producto(uuid)
  from public;
revoke execute
  on function public.obtener_detalle_variante_producto(uuid)
  from anon;
revoke execute
  on function public.obtener_detalle_variante_producto(uuid)
  from service_role;
grant execute
  on function public.obtener_detalle_variante_producto(uuid)
  to authenticated;


create function public.actualizar_variante_producto(
  p_variante_id uuid,
  p_cambios jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_variante public.producto_variantes%rowtype;
  v_codigo_sku text;
  v_color text;
  v_color_normalizado text;
  v_longitud_cm integer;
  v_clasificacion text;
  v_observaciones text;
  v_activo boolean;
begin
  if not public.usuario_actual_tiene_permiso('producto.editar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null
    or p_cambios is null
    or jsonb_typeof(p_cambios) <> 'object'
    or p_cambios = '{}'::jsonb
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_cambios) as campo(nombre)
    where campo.nombre not in (
      'codigo_sku',
      'color',
      'longitud_cm',
      'clasificacion',
      'observaciones',
      'activo'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if (p_cambios ? 'codigo_sku'
      and jsonb_typeof(p_cambios -> 'codigo_sku') <> 'string')
    or (p_cambios ? 'color'
      and jsonb_typeof(p_cambios -> 'color') <> 'string')
    or (p_cambios ? 'longitud_cm'
      and jsonb_typeof(p_cambios -> 'longitud_cm') <> 'number')
    or (p_cambios ? 'clasificacion'
      and jsonb_typeof(p_cambios -> 'clasificacion') <> 'string')
    or (p_cambios ? 'observaciones'
      and jsonb_typeof(p_cambios -> 'observaciones') not in ('string', 'null'))
    or (p_cambios ? 'activo'
      and jsonb_typeof(p_cambios -> 'activo') <> 'boolean')
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select variante.*
  into v_variante
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

  v_codigo_sku := v_variante.codigo_sku;
  v_color := v_variante.color;
  v_color_normalizado := v_variante.color_normalizado;
  v_longitud_cm := v_variante.longitud_cm;
  v_clasificacion := v_variante.clasificacion;
  v_observaciones := v_variante.observaciones;
  v_activo := v_variante.activo;

  if p_cambios ? 'codigo_sku' then
    v_codigo_sku := upper(btrim(p_cambios ->> 'codigo_sku'));

    if char_length(v_codigo_sku) < 3
      or char_length(v_codigo_sku) > 80
      or v_codigo_sku !~ '^[A-Z0-9][A-Z0-9._-]{1,78}[A-Z0-9]$'
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'color' then
    v_color := initcap(lower(btrim(
      regexp_replace(p_cambios ->> 'color', '[[:space:]]+', ' ', 'g')
    )));
    v_color_normalizado := lower(v_color);

    if v_color = '' or char_length(v_color) > 80 then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'longitud_cm' then
    if (p_cambios ->> 'longitud_cm') !~ '^[0-9]+$'
      or char_length(p_cambios ->> 'longitud_cm') > 4
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;

    v_longitud_cm := (p_cambios ->> 'longitud_cm')::integer;

    if v_longitud_cm <= 0 then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'clasificacion' then
    v_clasificacion := lower(btrim(p_cambios ->> 'clasificacion'));

    if v_clasificacion not in ('normal', 'completa', 'premium') then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'observaciones' then
    if jsonb_typeof(p_cambios -> 'observaciones') = 'null' then
      v_observaciones := null;
    else
      v_observaciones := nullif(btrim(p_cambios ->> 'observaciones'), '');

      if char_length(v_observaciones) > 500 then
        raise exception using
          errcode = '22023',
          message = 'Los parámetros proporcionados no son válidos.';
      end if;
    end if;
  end if;

  if p_cambios ? 'activo' then
    v_activo := (p_cambios ->> 'activo')::boolean;
  end if;

  update public.producto_variantes as variante
  set
    codigo_sku = v_codigo_sku,
    color = v_color,
    color_normalizado = v_color_normalizado,
    longitud_cm = v_longitud_cm,
    clasificacion = v_clasificacion,
    observaciones = v_observaciones,
    activo = v_activo,
    fecha_actualizacion = now()
  where variante.id = p_variante_id
  returning variante.* into v_variante;

  return jsonb_build_object(
    'variante', jsonb_build_object(
      'id', v_variante.id,
      'producto_id', v_variante.producto_id,
      'codigo_sku', v_variante.codigo_sku,
      'color', v_variante.color,
      'longitud_cm', v_variante.longitud_cm,
      'clasificacion', v_variante.clasificacion,
      'observaciones', v_variante.observaciones,
      'activo', v_variante.activo,
      'fecha_creacion', v_variante.fecha_creacion,
      'fecha_actualizacion', v_variante.fecha_actualizacion
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'La variante solicitada ya existe.';
end;
$funcion$;

revoke execute
  on function public.actualizar_variante_producto(uuid, jsonb)
  from public;
revoke execute
  on function public.actualizar_variante_producto(uuid, jsonb)
  from anon;
revoke execute
  on function public.actualizar_variante_producto(uuid, jsonb)
  from service_role;
grant execute
  on function public.actualizar_variante_producto(uuid, jsonb)
  to authenticated;


create function public.obtener_precios_vigentes_variante(
  p_variante_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_existe boolean;
  v_precios jsonb;
begin
  if not public.usuario_actual_tiene_permiso('producto.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select exists (
    select 1
    from public.producto_variantes as variante
    join public.productos as producto
      on producto.id = variante.producto_id
    where variante.id = p_variante_id
      and producto.codigo = 'SNAPDRAGON'
  )
  into v_existe;

  if not v_existe then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', precio.id,
        'presentacion_id', presentacion.id,
        'codigo_presentacion', presentacion.codigo,
        'presentacion', presentacion.nombre,
        'cantidad_manojos', presentacion.cantidad_manojos,
        'presentacion_activa', presentacion.activo,
        'precio', precio.precio,
        'vigente_desde', precio.vigente_desde
      )
      order by presentacion.cantidad_manojos, presentacion.id
    ),
    '[]'::jsonb
  )
  into v_precios
  from public.presentaciones_producto as presentacion
  left join public.precios_producto as precio
    on precio.presentacion_id = presentacion.id
    and precio.variante_id = p_variante_id
    and precio.vigente_hasta is null;

  return jsonb_build_object(
    'variante_id', p_variante_id,
    'precios', v_precios
  );
end;
$funcion$;

revoke execute
  on function public.obtener_precios_vigentes_variante(uuid)
  from public;
revoke execute
  on function public.obtener_precios_vigentes_variante(uuid)
  from anon;
revoke execute
  on function public.obtener_precios_vigentes_variante(uuid)
  from service_role;
grant execute
  on function public.obtener_precios_vigentes_variante(uuid)
  to authenticated;


create function public.registrar_precio_variante(
  p_variante_id uuid,
  p_presentacion_id uuid,
  p_precio numeric
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
  v_presentacion public.presentaciones_producto%rowtype;
  v_precio_actual public.precios_producto%rowtype;
  v_precio_nuevo public.precios_producto%rowtype;
  v_ahora timestamptz;
  v_usuario_id uuid;
begin
  if not public.usuario_actual_tiene_permiso('producto.editar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null
    or p_presentacion_id is null
    or p_precio is null
    or p_precio <= 0
    or p_precio > 9999999999.99
    or round(p_precio, 2) <> p_precio
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

  -- El bloqueo de la variante serializa todos sus cambios de precio y evita
  -- carreras incluso cuando dos presentaciones se actualizan a la vez.
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

  select presentacion.*
  into v_presentacion
  from public.presentaciones_producto as presentacion
  where presentacion.id = p_presentacion_id
  for key share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La presentación solicitada no existe.';
  end if;

  if not v_presentacion.activo then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  select precio.*
  into v_precio_actual
  from public.precios_producto as precio
  where precio.variante_id = p_variante_id
    and precio.presentacion_id = p_presentacion_id
    and precio.vigente_hasta is null
  for update;

  if found and v_precio_actual.precio = p_precio then
    return jsonb_build_object(
      'cambio', false,
      'precio', jsonb_build_object(
        'id', v_precio_actual.id,
        'variante_id', v_precio_actual.variante_id,
        'presentacion_id', v_precio_actual.presentacion_id,
        'precio', v_precio_actual.precio,
        'vigente_desde', v_precio_actual.vigente_desde,
        'vigente_hasta', v_precio_actual.vigente_hasta
      )
    );
  end if;

  v_ahora := case
    when v_precio_actual.id is null then clock_timestamp()
    else greatest(
      clock_timestamp(),
      v_precio_actual.vigente_desde + interval '1 microsecond'
    )
  end;

  if v_precio_actual.id is not null then
    update public.precios_producto as precio
    set vigente_hasta = v_ahora
    where precio.id = v_precio_actual.id;
  end if;

  insert into public.precios_producto (
    variante_id,
    presentacion_id,
    precio,
    vigente_desde,
    usuario_registro
  )
  values (
    p_variante_id,
    p_presentacion_id,
    p_precio,
    v_ahora,
    v_usuario_id
  )
  returning * into v_precio_nuevo;

  return jsonb_build_object(
    'cambio', true,
    'precio', jsonb_build_object(
      'id', v_precio_nuevo.id,
      'variante_id', v_precio_nuevo.variante_id,
      'presentacion_id', v_precio_nuevo.presentacion_id,
      'precio', v_precio_nuevo.precio,
      'vigente_desde', v_precio_nuevo.vigente_desde,
      'vigente_hasta', v_precio_nuevo.vigente_hasta
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'La operación solicitada no puede realizarse.';
end;
$funcion$;

revoke execute
  on function public.registrar_precio_variante(uuid, uuid, numeric)
  from public;
revoke execute
  on function public.registrar_precio_variante(uuid, uuid, numeric)
  from anon;
revoke execute
  on function public.registrar_precio_variante(uuid, uuid, numeric)
  from service_role;
grant execute
  on function public.registrar_precio_variante(uuid, uuid, numeric)
  to authenticated;


create function public.listar_historial_precios_variante(
  p_variante_id uuid,
  p_presentacion_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_existe boolean;
  v_historial jsonb;
begin
  if not public.usuario_actual_tiene_permiso('producto.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_variante_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select exists (
    select 1
    from public.producto_variantes as variante
    join public.productos as producto
      on producto.id = variante.producto_id
    where variante.id = p_variante_id
      and producto.codigo = 'SNAPDRAGON'
  )
  into v_existe;

  if not v_existe then
    raise exception using
      errcode = 'P0002',
      message = 'La variante solicitada no existe.';
  end if;

  if p_presentacion_id is not null
    and not exists (
      select 1
      from public.presentaciones_producto as presentacion
      where presentacion.id = p_presentacion_id
    )
  then
    raise exception using
      errcode = 'P0002',
      message = 'La presentación solicitada no existe.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', precio.id,
        'presentacion_id', presentacion.id,
        'codigo_presentacion', presentacion.codigo,
        'presentacion', presentacion.nombre,
        'cantidad_manojos', presentacion.cantidad_manojos,
        'precio', precio.precio,
        'vigente_desde', precio.vigente_desde,
        'vigente_hasta', precio.vigente_hasta,
        'estado', case
          when precio.vigente_hasta is null then 'vigente'
          else 'historico'
        end,
        'usuario_registro', jsonb_build_object(
          'id', perfil.id,
          'nombre_completo', perfil.nombre_completo
        )
      )
      order by precio.vigente_desde desc, precio.id desc
    ),
    '[]'::jsonb
  )
  into v_historial
  from public.precios_producto as precio
  join public.presentaciones_producto as presentacion
    on presentacion.id = precio.presentacion_id
  join public.perfiles as perfil
    on perfil.id = precio.usuario_registro
  where precio.variante_id = p_variante_id
    and (
      p_presentacion_id is null
      or precio.presentacion_id = p_presentacion_id
    );

  return jsonb_build_object(
    'variante_id', p_variante_id,
    'historial', v_historial
  );
end;
$funcion$;

revoke execute
  on function public.listar_historial_precios_variante(uuid, uuid)
  from public;
revoke execute
  on function public.listar_historial_precios_variante(uuid, uuid)
  from anon;
revoke execute
  on function public.listar_historial_precios_variante(uuid, uuid)
  from service_role;
grant execute
  on function public.listar_historial_precios_variante(uuid, uuid)
  to authenticated;

commit;
