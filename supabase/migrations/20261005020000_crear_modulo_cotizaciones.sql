begin;

-- La secuencia proporciona una numeración concurrente independiente del
-- frontend. Los huecos por transacciones revertidas son válidos y evitan
-- bloquear la creación de cotizaciones.
create sequence public.cotizaciones_correlativo_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

-- La serie guardada es el identificador operativo interno del creador. No es
-- una serie, autorización ni numeración fiscal FEL.
create table public.cotizaciones (
  id uuid not null default gen_random_uuid(),
  correlativo bigint not null default nextval(
    'public.cotizaciones_correlativo_seq'::regclass
  ),
  serie_usuario_snapshot varchar(8) not null,
  numero varchar(40) generated always as (
    'COT-' || serie_usuario_snapshot || '-' || case
      when correlativo < 1000000
        then lpad(correlativo::text, 6, '0')
      else correlativo::text
    end
  ) stored,
  cliente_id uuid,
  tipo_comprador varchar(20) not null,
  comprador_nombre varchar(200) not null,
  comprador_nit varchar(30) not null,
  comprador_direccion text,
  estado varchar(20) not null default 'borrador',
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  observaciones text,
  usuario_creador uuid not null,
  usuario_actualizacion uuid not null,
  fecha_emision timestamptz,
  fecha_anulacion timestamptz,
  fecha_conversion timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint cotizaciones_pk primary key (id),
  constraint cotizaciones_correlativo_unico unique (correlativo),
  constraint cotizaciones_numero_unico unique (numero),
  constraint cotizaciones_cliente_fk
    foreign key (cliente_id)
    references public.clientes (id)
    on delete restrict,
  constraint cotizaciones_usuario_creador_fk
    foreign key (usuario_creador)
    references public.perfiles (id)
    on delete restrict,
  constraint cotizaciones_usuario_actualizacion_fk
    foreign key (usuario_actualizacion)
    references public.perfiles (id)
    on delete restrict,
  constraint cotizaciones_correlativo_check
    check (correlativo > 0),
  constraint cotizaciones_serie_usuario_check
    check (
      serie_usuario_snapshot = upper(btrim(serie_usuario_snapshot))
      and serie_usuario_snapshot ~ '^[A-Z0-9]{1,8}$'
    ),
  constraint cotizaciones_numero_check
    check (numero ~ '^COT-[A-Z0-9]{1,8}-[0-9]{6,}$'),
  constraint cotizaciones_tipo_comprador_check
    check (tipo_comprador in ('registrado', 'ocasional')),
  constraint cotizaciones_cliente_segun_tipo_check
    check (
      (tipo_comprador = 'registrado' and cliente_id is not null)
      or (tipo_comprador = 'ocasional' and cliente_id is null)
    ),
  constraint cotizaciones_comprador_nombre_check
    check (btrim(comprador_nombre) <> ''),
  constraint cotizaciones_comprador_nit_check
    check (
      btrim(comprador_nit) <> ''
      and comprador_nit = upper(
        regexp_replace(btrim(comprador_nit), '[[:space:]-]+', '', 'g')
      )
    ),
  constraint cotizaciones_comprador_direccion_check
    check (
      comprador_direccion is null
      or (
        btrim(comprador_direccion) <> ''
        and char_length(comprador_direccion) <= 500
      )
    ),
  constraint cotizaciones_estado_check
    check (estado in ('borrador', 'emitida', 'convertida', 'anulada')),
  constraint cotizaciones_totales_check
    check (
      subtotal >= 0
      and total >= 0
      and subtotal = total
    ),
  constraint cotizaciones_observaciones_check
    check (observaciones is null or char_length(observaciones) <= 1000),
  constraint cotizaciones_fechas_estado_check
    check (
      (
        estado = 'borrador'
        and fecha_emision is null
        and fecha_anulacion is null
        and fecha_conversion is null
      )
      or (
        estado = 'emitida'
        and fecha_emision is not null
        and fecha_anulacion is null
        and fecha_conversion is null
      )
      or (
        estado = 'convertida'
        and fecha_emision is not null
        and fecha_anulacion is null
        and fecha_conversion is not null
      )
      or (
        estado = 'anulada'
        and fecha_anulacion is not null
        and fecha_conversion is null
      )
    )
);

alter sequence public.cotizaciones_correlativo_seq
  owned by public.cotizaciones.correlativo;

create table public.cotizacion_detalles (
  id uuid not null default gen_random_uuid(),
  cotizacion_id uuid not null,
  numero_linea integer not null,
  variante_id uuid not null,
  presentacion_id uuid not null,
  precio_producto_id uuid not null,
  producto_codigo_snapshot varchar(40) not null,
  producto_nombre_snapshot varchar(120) not null,
  producto_descripcion_snapshot text,
  codigo_sku_snapshot varchar(80) not null,
  color_snapshot varchar(80) not null,
  longitud_cm_snapshot integer not null,
  clasificacion_snapshot varchar(20) not null,
  presentacion_codigo_snapshot varchar(30) not null,
  presentacion_nombre_snapshot varchar(80) not null,
  cantidad_manojos_presentacion integer not null,
  cantidad_presentaciones integer not null,
  cantidad_manojos bigint not null,
  precio_unitario numeric(12, 2) not null,
  subtotal numeric(14, 2) not null,
  fecha_creacion timestamptz not null default now(),
  constraint cotizacion_detalles_pk primary key (id),
  constraint cotizacion_detalles_cotizacion_fk
    foreign key (cotizacion_id)
    references public.cotizaciones (id)
    on delete restrict,
  constraint cotizacion_detalles_variante_fk
    foreign key (variante_id)
    references public.producto_variantes (id)
    on delete restrict,
  constraint cotizacion_detalles_presentacion_fk
    foreign key (presentacion_id)
    references public.presentaciones_producto (id)
    on delete restrict,
  constraint cotizacion_detalles_precio_fk
    foreign key (precio_producto_id)
    references public.precios_producto (id)
    on delete restrict,
  constraint cotizacion_detalles_linea_unica
    unique (cotizacion_id, numero_linea),
  constraint cotizacion_detalles_producto_unico
    unique (cotizacion_id, variante_id, presentacion_id),
  constraint cotizacion_detalles_numero_linea_check
    check (numero_linea between 1 and 100),
  constraint cotizacion_detalles_producto_codigo_check
    check (
      producto_codigo_snapshot = upper(btrim(producto_codigo_snapshot))
      and producto_codigo_snapshot ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  constraint cotizacion_detalles_producto_nombre_check
    check (btrim(producto_nombre_snapshot) <> ''),
  constraint cotizacion_detalles_sku_check
    check (
      codigo_sku_snapshot = upper(btrim(codigo_sku_snapshot))
      and codigo_sku_snapshot ~
        '^[A-Z0-9][A-Z0-9._-]{1,78}[A-Z0-9]$'
    ),
  constraint cotizacion_detalles_color_check
    check (btrim(color_snapshot) <> ''),
  constraint cotizacion_detalles_longitud_check
    check (longitud_cm_snapshot > 0),
  constraint cotizacion_detalles_clasificacion_check
    check (clasificacion_snapshot in ('normal', 'completa', 'premium')),
  constraint cotizacion_detalles_presentacion_codigo_check
    check (
      presentacion_codigo_snapshot = lower(
        btrim(presentacion_codigo_snapshot)
      )
      and presentacion_codigo_snapshot ~ '^[a-z0-9][a-z0-9_]*$'
    ),
  constraint cotizacion_detalles_presentacion_nombre_check
    check (btrim(presentacion_nombre_snapshot) <> ''),
  constraint cotizacion_detalles_cantidades_check
    check (
      cantidad_manojos_presentacion > 0
      and cantidad_presentaciones between 1 and 1000000
      and cantidad_manojos > 0
      and cantidad_manojos =
        cantidad_manojos_presentacion::bigint
        * cantidad_presentaciones::bigint
    ),
  constraint cotizacion_detalles_precio_check
    check (precio_unitario > 0),
  constraint cotizacion_detalles_subtotal_check
    check (
      subtotal > 0
      and subtotal = round(
        cantidad_presentaciones::numeric * precio_unitario,
        2
      )
    )
);

create index indice_cotizaciones_estado_fecha
  on public.cotizaciones (estado, fecha_creacion desc, id desc);
create index indice_cotizaciones_cliente
  on public.cotizaciones (cliente_id)
  where cliente_id is not null;
create index indice_cotizaciones_usuario_creador
  on public.cotizaciones (usuario_creador, fecha_creacion desc);
create index indice_cotizacion_detalles_variante
  on public.cotizacion_detalles (variante_id);
create index indice_cotizacion_detalles_presentacion
  on public.cotizacion_detalles (presentacion_id);
create index indice_cotizacion_detalles_precio
  on public.cotizacion_detalles (precio_producto_id);

alter table public.cotizaciones enable row level security;
alter table public.cotizacion_detalles enable row level security;

revoke all privileges
  on sequence public.cotizaciones_correlativo_seq
  from public;
revoke all privileges
  on sequence public.cotizaciones_correlativo_seq
  from anon;
revoke all privileges
  on sequence public.cotizaciones_correlativo_seq
  from authenticated;
revoke all privileges
  on sequence public.cotizaciones_correlativo_seq
  from service_role;


-- Función interna para reemplazar atómicamente el detalle de un borrador.
-- Conserva snapshots existentes y consulta datos vigentes solo en líneas nuevas.
create function public.reemplazar_detalles_cotizacion(
  p_cotizacion_id uuid,
  p_detalles jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_detalle jsonb;
  v_numero_linea bigint;
  v_variante_id uuid;
  v_presentacion_id uuid;
  v_cantidad_presentaciones integer;
  v_producto_codigo varchar(40);
  v_producto_nombre varchar(120);
  v_producto_descripcion text;
  v_codigo_sku varchar(80);
  v_color varchar(80);
  v_longitud_cm integer;
  v_clasificacion varchar(20);
  v_presentacion_codigo varchar(30);
  v_presentacion_nombre varchar(80);
  v_cantidad_manojos_presentacion integer;
  v_precio_producto_id uuid;
  v_precio_unitario numeric(12, 2);
  v_cantidad_manojos bigint;
  v_subtotal_linea numeric;
  v_total numeric := 0;
  v_detalles_anteriores jsonb;
  v_detalle_anterior jsonb;
  v_clave_detalle text;
begin
  if p_cotizacion_id is null
    or p_detalles is null
    or jsonb_typeof(p_detalles) <> 'array'
    or jsonb_array_length(p_detalles) < 1
    or jsonb_array_length(p_detalles) > 100
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if not exists (
    select 1
    from public.cotizaciones as cotizacion
    where cotizacion.id = p_cotizacion_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'La cotización solicitada no existe.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_detalles) as detalle(valor)
    where jsonb_typeof(detalle.valor) <> 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_detalles) as detalle(valor)
    where not (
      detalle.valor ?& array[
        'variante_id',
        'presentacion_id',
        'cantidad_presentaciones'
      ]
    )
      or exists (
        select 1
        from jsonb_object_keys(detalle.valor) as campo(nombre)
        where campo.nombre not in (
          'variante_id',
          'presentacion_id',
          'cantidad_presentaciones'
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select coalesce(
    jsonb_object_agg(
      detalle.variante_id::text || ':' || detalle.presentacion_id::text,
      to_jsonb(detalle)
    ),
    '{}'::jsonb
  )
  into v_detalles_anteriores
  from public.cotizacion_detalles as detalle
  where detalle.cotizacion_id = p_cotizacion_id;

  delete from public.cotizacion_detalles as detalle
  where detalle.cotizacion_id = p_cotizacion_id;

  for v_detalle, v_numero_linea in
    select
      detalle.valor,
      detalle.numero_linea
    from jsonb_array_elements(p_detalles)
      with ordinality as detalle(valor, numero_linea)
    order by detalle.numero_linea
  loop
    if jsonb_typeof(v_detalle -> 'variante_id') <> 'string'
      or jsonb_typeof(v_detalle -> 'presentacion_id') <> 'string'
      or jsonb_typeof(v_detalle -> 'cantidad_presentaciones') <> 'number'
      or (v_detalle ->> 'variante_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or (v_detalle ->> 'presentacion_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or (v_detalle ->> 'cantidad_presentaciones') !~ '^[0-9]+$'
      or char_length(v_detalle ->> 'cantidad_presentaciones') > 7
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;

    v_variante_id := (v_detalle ->> 'variante_id')::uuid;
    v_presentacion_id := (v_detalle ->> 'presentacion_id')::uuid;
    v_cantidad_presentaciones :=
      (v_detalle ->> 'cantidad_presentaciones')::integer;

    if v_cantidad_presentaciones < 1
      or v_cantidad_presentaciones > 1000000
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;

    v_clave_detalle :=
      v_variante_id::text || ':' || v_presentacion_id::text;
    v_detalle_anterior := v_detalles_anteriores -> v_clave_detalle;

    if v_detalle_anterior is not null then
      v_precio_producto_id :=
        (v_detalle_anterior ->> 'precio_producto_id')::uuid;
      v_producto_codigo :=
        v_detalle_anterior ->> 'producto_codigo_snapshot';
      v_producto_nombre :=
        v_detalle_anterior ->> 'producto_nombre_snapshot';
      v_producto_descripcion :=
        v_detalle_anterior ->> 'producto_descripcion_snapshot';
      v_codigo_sku := v_detalle_anterior ->> 'codigo_sku_snapshot';
      v_color := v_detalle_anterior ->> 'color_snapshot';
      v_longitud_cm :=
        (v_detalle_anterior ->> 'longitud_cm_snapshot')::integer;
      v_clasificacion :=
        v_detalle_anterior ->> 'clasificacion_snapshot';
      v_presentacion_codigo :=
        v_detalle_anterior ->> 'presentacion_codigo_snapshot';
      v_presentacion_nombre :=
        v_detalle_anterior ->> 'presentacion_nombre_snapshot';
      v_cantidad_manojos_presentacion := (
        v_detalle_anterior ->> 'cantidad_manojos_presentacion'
      )::integer;
      v_precio_unitario :=
        (v_detalle_anterior ->> 'precio_unitario')::numeric(12, 2);
    else
      select
        producto.codigo,
        producto.nombre,
        producto.descripcion,
        variante.codigo_sku,
        variante.color,
        variante.longitud_cm,
        variante.clasificacion
      into
        v_producto_codigo,
        v_producto_nombre,
        v_producto_descripcion,
        v_codigo_sku,
        v_color,
        v_longitud_cm,
        v_clasificacion
      from public.producto_variantes as variante
      join public.productos as producto
        on producto.id = variante.producto_id
      where variante.id = v_variante_id
        and producto.codigo = 'SNAPDRAGON'
        and producto.activo is true
        and variante.activo is true
      for key share of producto, variante;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'Una variante solicitada no existe o no está activa.';
      end if;

      select
        presentacion.codigo,
        presentacion.nombre,
        presentacion.cantidad_manojos
      into
        v_presentacion_codigo,
        v_presentacion_nombre,
        v_cantidad_manojos_presentacion
      from public.presentaciones_producto as presentacion
      where presentacion.id = v_presentacion_id
        and presentacion.activo is true
      for key share;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'Una presentación solicitada no existe o no está activa.';
      end if;

      select
        precio.id,
        precio.precio
      into
        v_precio_producto_id,
        v_precio_unitario
      from public.precios_producto as precio
      where precio.variante_id = v_variante_id
        and precio.presentacion_id = v_presentacion_id
        and precio.vigente_hasta is null
      for key share;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'No existe un precio vigente para una línea solicitada.';
      end if;
    end if;

    v_cantidad_manojos :=
      v_cantidad_presentaciones::bigint
      * v_cantidad_manojos_presentacion::bigint;
    v_subtotal_linea := round(
      v_cantidad_presentaciones::numeric * v_precio_unitario,
      2
    );

    if v_subtotal_linea > 999999999999.99
      or v_total + v_subtotal_linea > 999999999999.99
    then
      raise exception using
        errcode = '22003',
        message = 'El total de la cotización excede el límite permitido.';
    end if;

    insert into public.cotizacion_detalles (
      cotizacion_id,
      numero_linea,
      variante_id,
      presentacion_id,
      precio_producto_id,
      producto_codigo_snapshot,
      producto_nombre_snapshot,
      producto_descripcion_snapshot,
      codigo_sku_snapshot,
      color_snapshot,
      longitud_cm_snapshot,
      clasificacion_snapshot,
      presentacion_codigo_snapshot,
      presentacion_nombre_snapshot,
      cantidad_manojos_presentacion,
      cantidad_presentaciones,
      cantidad_manojos,
      precio_unitario,
      subtotal
    )
    values (
      p_cotizacion_id,
      v_numero_linea::integer,
      v_variante_id,
      v_presentacion_id,
      v_precio_producto_id,
      v_producto_codigo,
      v_producto_nombre,
      v_producto_descripcion,
      v_codigo_sku,
      v_color,
      v_longitud_cm,
      v_clasificacion,
      v_presentacion_codigo,
      v_presentacion_nombre,
      v_cantidad_manojos_presentacion,
      v_cantidad_presentaciones,
      v_cantidad_manojos,
      v_precio_unitario,
      v_subtotal_linea
    );

    v_total := v_total + v_subtotal_linea;
  end loop;

  update public.cotizaciones as cotizacion
  set
    subtotal = v_total,
    total = v_total,
    fecha_actualizacion = now()
  where cotizacion.id = p_cotizacion_id;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'No se permiten líneas duplicadas en una cotización.';
end;
$funcion$;

revoke execute
  on function public.reemplazar_detalles_cotizacion(uuid, jsonb)
  from public;
revoke execute
  on function public.reemplazar_detalles_cotizacion(uuid, jsonb)
  from anon;
revoke execute
  on function public.reemplazar_detalles_cotizacion(uuid, jsonb)
  from authenticated;
revoke execute
  on function public.reemplazar_detalles_cotizacion(uuid, jsonb)
  from service_role;


create function public.listar_cotizaciones(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_estado text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_busqueda text;
  v_busqueda_nit text;
  v_estado text;
  v_total bigint;
  v_cotizaciones jsonb;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.ver') then
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
  v_busqueda_nit := nullif(
    upper(regexp_replace(v_busqueda, '[[:space:]-]+', '', 'g')),
    ''
  );
  v_estado := nullif(lower(btrim(p_estado)), '');

  if char_length(v_busqueda) > 200
    or (
      v_estado is not null
      and v_estado not in ('borrador', 'emitida', 'convertida', 'anulada')
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.cotizaciones as cotizacion
  where (v_estado is null or cotizacion.estado = v_estado)
    and (
      p_fecha_desde is null
      or cotizacion.fecha_creacion >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      p_fecha_hasta is null
      or cotizacion.fecha_creacion < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      v_busqueda is null
      or strpos(lower(cotizacion.numero), lower(v_busqueda)) > 0
      or strpos(
        lower(cotizacion.comprador_nombre),
        lower(v_busqueda)
      ) > 0
      or (
        v_busqueda_nit is not null
        and strpos(cotizacion.comprador_nit, v_busqueda_nit) > 0
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'numero', pagina.numero,
        'correlativo', pagina.correlativo,
        'serie_usuario_snapshot', pagina.serie_usuario_snapshot,
        'cliente_id', pagina.cliente_id,
        'tipo_comprador', pagina.tipo_comprador,
        'comprador_nombre', pagina.comprador_nombre,
        'comprador_nit', pagina.comprador_nit,
        'estado', pagina.estado,
        'subtotal', pagina.subtotal,
        'total', pagina.total,
        'usuario_creador', jsonb_build_object(
          'id', pagina.usuario_creador,
          'nombre_completo', pagina.nombre_usuario_creador
        ),
        'fecha_emision', pagina.fecha_emision,
        'fecha_anulacion', pagina.fecha_anulacion,
        'fecha_conversion', pagina.fecha_conversion,
        'fecha_creacion', pagina.fecha_creacion,
        'fecha_actualizacion', pagina.fecha_actualizacion
      )
      order by pagina.fecha_creacion desc, pagina.id desc
    ),
    '[]'::jsonb
  )
  into v_cotizaciones
  from (
    select
      cotizacion.*,
      perfil.nombre_completo as nombre_usuario_creador
    from public.cotizaciones as cotizacion
    join public.perfiles as perfil
      on perfil.id = cotizacion.usuario_creador
    where (v_estado is null or cotizacion.estado = v_estado)
      and (
        p_fecha_desde is null
        or cotizacion.fecha_creacion >= (
          p_fecha_desde::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        p_fecha_hasta is null
        or cotizacion.fecha_creacion < (
          (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        v_busqueda is null
        or strpos(lower(cotizacion.numero), lower(v_busqueda)) > 0
        or strpos(
          lower(cotizacion.comprador_nombre),
          lower(v_busqueda)
        ) > 0
        or (
          v_busqueda_nit is not null
          and strpos(cotizacion.comprador_nit, v_busqueda_nit) > 0
        )
      )
    order by cotizacion.fecha_creacion desc, cotizacion.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'cotizaciones', v_cotizaciones,
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
  on function public.listar_cotizaciones(integer, integer, text, text, date, date)
  from public;
revoke execute
  on function public.listar_cotizaciones(integer, integer, text, text, date, date)
  from anon;
revoke execute
  on function public.listar_cotizaciones(integer, integer, text, text, date, date)
  from service_role;
grant execute
  on function public.listar_cotizaciones(integer, integer, text, text, date, date)
  to authenticated;


create function public.obtener_cotizacion(
  p_cotizacion_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_cotizacion jsonb;
  v_detalles jsonb;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_cotizacion_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select jsonb_build_object(
    'id', cotizacion.id,
    'numero', cotizacion.numero,
    'correlativo', cotizacion.correlativo,
    'serie_usuario_snapshot', cotizacion.serie_usuario_snapshot,
    'cliente_id', cotizacion.cliente_id,
    'tipo_comprador', cotizacion.tipo_comprador,
    'comprador_nombre', cotizacion.comprador_nombre,
    'comprador_nit', cotizacion.comprador_nit,
    'comprador_direccion', cotizacion.comprador_direccion,
    'estado', cotizacion.estado,
    'subtotal', cotizacion.subtotal,
    'total', cotizacion.total,
    'observaciones', cotizacion.observaciones,
    'usuario_creador', jsonb_build_object(
      'id', creador.id,
      'nombre_completo', creador.nombre_completo
    ),
    'usuario_actualizacion', jsonb_build_object(
      'id', actualizador.id,
      'nombre_completo', actualizador.nombre_completo
    ),
    'fecha_emision', cotizacion.fecha_emision,
    'fecha_anulacion', cotizacion.fecha_anulacion,
    'fecha_conversion', cotizacion.fecha_conversion,
    'fecha_creacion', cotizacion.fecha_creacion,
    'fecha_actualizacion', cotizacion.fecha_actualizacion
  )
  into v_cotizacion
  from public.cotizaciones as cotizacion
  join public.perfiles as creador
    on creador.id = cotizacion.usuario_creador
  join public.perfiles as actualizador
    on actualizador.id = cotizacion.usuario_actualizacion
  where cotizacion.id = p_cotizacion_id;

  if v_cotizacion is null then
    raise exception using
      errcode = 'P0002',
      message = 'La cotización solicitada no existe.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', detalle.id,
        'numero_linea', detalle.numero_linea,
        'variante_id', detalle.variante_id,
        'presentacion_id', detalle.presentacion_id,
        'precio_producto_id', detalle.precio_producto_id,
        'producto_codigo', detalle.producto_codigo_snapshot,
        'producto_nombre', detalle.producto_nombre_snapshot,
        'producto_descripcion', detalle.producto_descripcion_snapshot,
        'codigo_sku', detalle.codigo_sku_snapshot,
        'color', detalle.color_snapshot,
        'longitud_cm', detalle.longitud_cm_snapshot,
        'clasificacion', detalle.clasificacion_snapshot,
        'presentacion_codigo', detalle.presentacion_codigo_snapshot,
        'presentacion_nombre', detalle.presentacion_nombre_snapshot,
        'cantidad_manojos_presentacion',
          detalle.cantidad_manojos_presentacion,
        'cantidad_presentaciones', detalle.cantidad_presentaciones,
        'cantidad_manojos', detalle.cantidad_manojos,
        'precio_unitario', detalle.precio_unitario,
        'subtotal', detalle.subtotal
      )
      order by detalle.numero_linea, detalle.id
    ),
    '[]'::jsonb
  )
  into v_detalles
  from public.cotizacion_detalles as detalle
  where detalle.cotizacion_id = p_cotizacion_id;

  return jsonb_build_object(
    'cotizacion', v_cotizacion,
    'detalles', v_detalles
  );
end;
$funcion$;

revoke execute on function public.obtener_cotizacion(uuid)
  from public;
revoke execute on function public.obtener_cotizacion(uuid)
  from anon;
revoke execute on function public.obtener_cotizacion(uuid)
  from service_role;
grant execute on function public.obtener_cotizacion(uuid)
  to authenticated;


create function public.crear_cotizacion(
  p_cliente_id uuid,
  p_comprador_nombre text,
  p_comprador_nit text,
  p_comprador_direccion text,
  p_observaciones text,
  p_detalles jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_tipo_comprador text;
  v_comprador_nombre text;
  v_comprador_nit text;
  v_comprador_direccion text;
  v_observaciones text;
  v_usuario_id uuid;
  v_serie_usuario varchar(8);
  v_cotizacion_id uuid;
  v_cotizacion public.cotizaciones%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_usuario_id := auth.uid();

  if v_usuario_id is null then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select perfil.serie_documentos
  into v_serie_usuario
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if v_serie_usuario is null then
    raise exception using
      errcode = '23514',
      message = 'El usuario no tiene una serie de documentos asignada.';
  end if;

  v_observaciones := nullif(
    btrim(regexp_replace(p_observaciones, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if char_length(v_observaciones) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cliente_id is not null then
    select
      coalesce(cliente.nombre_completo, cliente.razon_social),
      cliente.nit,
      cliente.direccion
    into
      v_comprador_nombre,
      v_comprador_nit,
      v_comprador_direccion
    from public.clientes as cliente
    where cliente.id = p_cliente_id
      and cliente.activo is true
    for key share;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'El cliente solicitado no existe o no está activo.';
    end if;

    v_tipo_comprador := 'registrado';
  else
    v_tipo_comprador := 'ocasional';
    v_comprador_nombre := nullif(
      btrim(regexp_replace(p_comprador_nombre, '[[:space:]]+', ' ', 'g')),
      ''
    );
    v_comprador_nit := nullif(
      upper(regexp_replace(p_comprador_nit, '[[:space:]-]+', '', 'g')),
      ''
    );
    v_comprador_direccion := nullif(
      btrim(
        regexp_replace(p_comprador_direccion, '[[:space:]]+', ' ', 'g')
      ),
      ''
    );

    if v_comprador_nombre is null
      or char_length(v_comprador_nombre) > 200
      or v_comprador_nit is null
      or char_length(v_comprador_nit) > 30
      or char_length(v_comprador_direccion) > 500
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  insert into public.cotizaciones (
    serie_usuario_snapshot,
    cliente_id,
    tipo_comprador,
    comprador_nombre,
    comprador_nit,
    comprador_direccion,
    observaciones,
    usuario_creador,
    usuario_actualizacion
  )
  values (
    v_serie_usuario,
    p_cliente_id,
    v_tipo_comprador,
    v_comprador_nombre,
    v_comprador_nit,
    v_comprador_direccion,
    v_observaciones,
    v_usuario_id,
    v_usuario_id
  )
  returning * into v_cotizacion;

  v_cotizacion_id := v_cotizacion.id;

  perform public.reemplazar_detalles_cotizacion(
    v_cotizacion_id,
    p_detalles
  );

  select cotizacion.*
  into v_cotizacion
  from public.cotizaciones as cotizacion
  where cotizacion.id = v_cotizacion_id;

  return jsonb_build_object(
    'cotizacion', jsonb_build_object(
      'id', v_cotizacion.id,
      'numero', v_cotizacion.numero,
      'correlativo', v_cotizacion.correlativo,
      'serie_usuario_snapshot', v_cotizacion.serie_usuario_snapshot,
      'estado', v_cotizacion.estado,
      'subtotal', v_cotizacion.subtotal,
      'total', v_cotizacion.total,
      'fecha_creacion', v_cotizacion.fecha_creacion,
      'fecha_actualizacion', v_cotizacion.fecha_actualizacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.crear_cotizacion(uuid, text, text, text, text, jsonb)
  from public;
revoke execute
  on function public.crear_cotizacion(uuid, text, text, text, text, jsonb)
  from anon;
revoke execute
  on function public.crear_cotizacion(uuid, text, text, text, text, jsonb)
  from service_role;
grant execute
  on function public.crear_cotizacion(uuid, text, text, text, text, jsonb)
  to authenticated;


create function public.actualizar_cotizacion(
  p_cotizacion_id uuid,
  p_cliente_id uuid,
  p_comprador_nombre text,
  p_comprador_nit text,
  p_comprador_direccion text,
  p_observaciones text,
  p_detalles jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_tipo_comprador text;
  v_comprador_nombre text;
  v_comprador_nit text;
  v_comprador_direccion text;
  v_observaciones text;
  v_usuario_id uuid;
  v_cotizacion public.cotizaciones%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.editar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_cotizacion_id is null then
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

  select cotizacion.*
  into v_cotizacion
  from public.cotizaciones as cotizacion
  where cotizacion.id = p_cotizacion_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La cotización solicitada no existe.';
  end if;

  if v_cotizacion.estado <> 'borrador' then
    raise exception using
      errcode = '23514',
      message = 'La cotización ya no puede editarse.';
  end if;

  v_observaciones := nullif(
    btrim(regexp_replace(p_observaciones, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if char_length(v_observaciones) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cliente_id is not null then
    if v_cotizacion.tipo_comprador = 'registrado'
      and v_cotizacion.cliente_id = p_cliente_id
    then
      v_comprador_nombre := v_cotizacion.comprador_nombre;
      v_comprador_nit := v_cotizacion.comprador_nit;
      v_comprador_direccion := v_cotizacion.comprador_direccion;
    else
      select
        coalesce(cliente.nombre_completo, cliente.razon_social),
        cliente.nit,
        cliente.direccion
      into
        v_comprador_nombre,
        v_comprador_nit,
        v_comprador_direccion
      from public.clientes as cliente
      where cliente.id = p_cliente_id
        and cliente.activo is true
      for key share;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'El cliente solicitado no existe o no está activo.';
      end if;
    end if;

    v_tipo_comprador := 'registrado';
  else
    v_tipo_comprador := 'ocasional';
    v_comprador_nombre := nullif(
      btrim(regexp_replace(p_comprador_nombre, '[[:space:]]+', ' ', 'g')),
      ''
    );
    v_comprador_nit := nullif(
      upper(regexp_replace(p_comprador_nit, '[[:space:]-]+', '', 'g')),
      ''
    );
    v_comprador_direccion := nullif(
      btrim(
        regexp_replace(p_comprador_direccion, '[[:space:]]+', ' ', 'g')
      ),
      ''
    );

    if v_comprador_nombre is null
      or char_length(v_comprador_nombre) > 200
      or v_comprador_nit is null
      or char_length(v_comprador_nit) > 30
      or char_length(v_comprador_direccion) > 500
    then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  update public.cotizaciones as cotizacion
  set
    cliente_id = p_cliente_id,
    tipo_comprador = v_tipo_comprador,
    comprador_nombre = v_comprador_nombre,
    comprador_nit = v_comprador_nit,
    comprador_direccion = v_comprador_direccion,
    observaciones = v_observaciones,
    usuario_actualizacion = v_usuario_id,
    fecha_actualizacion = now()
  where cotizacion.id = p_cotizacion_id;

  perform public.reemplazar_detalles_cotizacion(
    p_cotizacion_id,
    p_detalles
  );

  select cotizacion.*
  into v_cotizacion
  from public.cotizaciones as cotizacion
  where cotizacion.id = p_cotizacion_id;

  return jsonb_build_object(
    'cotizacion', jsonb_build_object(
      'id', v_cotizacion.id,
      'numero', v_cotizacion.numero,
      'correlativo', v_cotizacion.correlativo,
      'serie_usuario_snapshot', v_cotizacion.serie_usuario_snapshot,
      'estado', v_cotizacion.estado,
      'subtotal', v_cotizacion.subtotal,
      'total', v_cotizacion.total,
      'fecha_creacion', v_cotizacion.fecha_creacion,
      'fecha_actualizacion', v_cotizacion.fecha_actualizacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.actualizar_cotizacion(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
  from public;
revoke execute
  on function public.actualizar_cotizacion(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
  from anon;
revoke execute
  on function public.actualizar_cotizacion(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
  from service_role;
grant execute
  on function public.actualizar_cotizacion(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb
  )
  to authenticated;


-- La conversión se reserva para la futura RPC de Ventas. Esta función solo
-- permite emitir o anular y nunca marca una cotización como convertida.
create function public.cambiar_estado_cotizacion(
  p_cotizacion_id uuid,
  p_estado text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_estado text;
  v_usuario_id uuid;
  v_ahora timestamptz;
  v_cambio boolean := true;
  v_cotizacion public.cotizaciones%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.editar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_estado := lower(btrim(p_estado));

  if p_cotizacion_id is null
    or v_estado is null
    or v_estado not in ('emitida', 'anulada')
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

  select cotizacion.*
  into v_cotizacion
  from public.cotizaciones as cotizacion
  where cotizacion.id = p_cotizacion_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La cotización solicitada no existe.';
  end if;

  if v_cotizacion.estado = v_estado then
    v_cambio := false;
  elsif v_estado = 'emitida' and v_cotizacion.estado <> 'borrador' then
    raise exception using
      errcode = '23514',
      message = 'La transición de estado solicitada no es válida.';
  elsif v_estado = 'anulada'
    and v_cotizacion.estado not in ('borrador', 'emitida')
  then
    raise exception using
      errcode = '23514',
      message = 'La transición de estado solicitada no es válida.';
  end if;

  if v_estado = 'emitida'
    and (
      v_cotizacion.total <= 0
      or not exists (
        select 1
        from public.cotizacion_detalles as detalle
        where detalle.cotizacion_id = p_cotizacion_id
      )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La cotización no tiene un detalle válido para emitirse.';
  end if;

  if v_cambio then
    v_ahora := clock_timestamp();

    update public.cotizaciones as cotizacion
    set
      estado = v_estado,
      fecha_emision = case
        when v_estado = 'emitida' then v_ahora
        else cotizacion.fecha_emision
      end,
      fecha_anulacion = case
        when v_estado = 'anulada' then v_ahora
        else null
      end,
      usuario_actualizacion = v_usuario_id,
      fecha_actualizacion = v_ahora
    where cotizacion.id = p_cotizacion_id
    returning cotizacion.* into v_cotizacion;
  end if;

  return jsonb_build_object(
    'cambio', v_cambio,
    'cotizacion', jsonb_build_object(
      'id', v_cotizacion.id,
      'numero', v_cotizacion.numero,
      'correlativo', v_cotizacion.correlativo,
      'serie_usuario_snapshot', v_cotizacion.serie_usuario_snapshot,
      'estado', v_cotizacion.estado,
      'fecha_emision', v_cotizacion.fecha_emision,
      'fecha_anulacion', v_cotizacion.fecha_anulacion,
      'fecha_conversion', v_cotizacion.fecha_conversion,
      'fecha_actualizacion', v_cotizacion.fecha_actualizacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.cambiar_estado_cotizacion(uuid, text)
  from public;
revoke execute
  on function public.cambiar_estado_cotizacion(uuid, text)
  from anon;
revoke execute
  on function public.cambiar_estado_cotizacion(uuid, text)
  from service_role;
grant execute
  on function public.cambiar_estado_cotizacion(uuid, text)
  to authenticated;

commit;
