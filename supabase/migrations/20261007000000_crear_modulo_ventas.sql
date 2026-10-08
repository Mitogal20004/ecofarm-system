begin;

-- La Venta tiene identidad propia porque existe aunque todavía no tenga un
-- Recibo o una futura Factura FEL. Los correlativos son globales y los huecos
-- causados por rollback son aceptables.
create sequence public.ventas_correlativo_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create sequence public.recibos_correlativo_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table public.ventas (
  id uuid not null default gen_random_uuid(),
  correlativo bigint not null default nextval(
    'public.ventas_correlativo_seq'::regclass
  ),
  serie_usuario_snapshot varchar(8) not null,
  numero varchar(40) generated always as (
    'VTA-' || serie_usuario_snapshot || '-' || case
      when correlativo < 1000000
        then lpad(correlativo::text, 6, '0')
      else correlativo::text
    end
  ) stored,
  origen varchar(20) not null,
  clave_idempotencia uuid,
  cotizacion_id uuid,
  cliente_id uuid,
  tipo_comprador varchar(20) not null,
  comprador_nombre varchar(200) not null,
  comprador_nit varchar(30) not null,
  comprador_direccion text,
  estado varchar(20) not null default 'confirmada',
  subtotal numeric(14, 2) not null,
  total numeric(14, 2) not null,
  observaciones text,
  usuario_creador uuid not null,
  usuario_anulacion uuid,
  motivo_anulacion varchar(500),
  fecha_confirmacion timestamptz not null default now(),
  fecha_anulacion timestamptz,
  fecha_actualizacion timestamptz not null default now(),
  constraint ventas_pk primary key (id),
  constraint ventas_correlativo_unico unique (correlativo),
  constraint ventas_numero_unico unique (numero),
  constraint ventas_clave_idempotencia_unica unique (clave_idempotencia),
  constraint ventas_cotizacion_unica unique (cotizacion_id),
  constraint ventas_cotizacion_fk
    foreign key (cotizacion_id)
    references public.cotizaciones (id)
    on delete restrict,
  constraint ventas_cliente_fk
    foreign key (cliente_id)
    references public.clientes (id)
    on delete restrict,
  constraint ventas_usuario_creador_fk
    foreign key (usuario_creador)
    references public.perfiles (id)
    on delete restrict,
  constraint ventas_usuario_anulacion_fk
    foreign key (usuario_anulacion)
    references public.perfiles (id)
    on delete restrict,
  constraint ventas_correlativo_check
    check (correlativo > 0),
  constraint ventas_serie_usuario_check
    check (
      serie_usuario_snapshot = upper(btrim(serie_usuario_snapshot))
      and serie_usuario_snapshot ~ '^[A-Z0-9]{1,8}$'
    ),
  constraint ventas_numero_check
    check (numero ~ '^VTA-[A-Z0-9]{1,8}-[0-9]{6,}$'),
  constraint ventas_origen_check
    check (origen in ('directa', 'cotizacion')),
  constraint ventas_referencia_origen_check
    check (
      (
        origen = 'directa'
        and clave_idempotencia is not null
        and cotizacion_id is null
      )
      or (
        origen = 'cotizacion'
        and clave_idempotencia is null
        and cotizacion_id is not null
      )
    ),
  constraint ventas_tipo_comprador_check
    check (tipo_comprador in ('registrado', 'ocasional')),
  constraint ventas_cliente_segun_tipo_check
    check (
      (tipo_comprador = 'registrado' and cliente_id is not null)
      or (tipo_comprador = 'ocasional' and cliente_id is null)
    ),
  constraint ventas_comprador_nombre_check
    check (btrim(comprador_nombre) <> ''),
  constraint ventas_comprador_nit_check
    check (
      btrim(comprador_nit) <> ''
      and comprador_nit = upper(
        regexp_replace(btrim(comprador_nit), '[[:space:]-]+', '', 'g')
      )
    ),
  constraint ventas_comprador_direccion_check
    check (
      comprador_direccion is null
      or (
        btrim(comprador_direccion) <> ''
        and char_length(comprador_direccion) <= 500
      )
    ),
  constraint ventas_estado_check
    check (estado in ('confirmada', 'anulada')),
  constraint ventas_totales_check
    check (
      subtotal >= 0
      and total >= 0
      and subtotal = total
    ),
  constraint ventas_observaciones_check
    check (observaciones is null or char_length(observaciones) <= 1000),
  constraint ventas_anulacion_check
    check (
      (
        estado = 'confirmada'
        and usuario_anulacion is null
        and motivo_anulacion is null
        and fecha_anulacion is null
      )
      or (
        estado = 'anulada'
        and usuario_anulacion is not null
        and motivo_anulacion is not null
        and btrim(motivo_anulacion) <> ''
        and fecha_anulacion is not null
        and fecha_anulacion >= fecha_confirmacion
      )
    )
);

alter sequence public.ventas_correlativo_seq
  owned by public.ventas.correlativo;

create table public.venta_detalles (
  id uuid not null default gen_random_uuid(),
  venta_id uuid not null,
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
  constraint venta_detalles_pk primary key (id),
  constraint venta_detalles_venta_fk
    foreign key (venta_id)
    references public.ventas (id)
    on delete restrict,
  constraint venta_detalles_variante_fk
    foreign key (variante_id)
    references public.producto_variantes (id)
    on delete restrict,
  constraint venta_detalles_presentacion_fk
    foreign key (presentacion_id)
    references public.presentaciones_producto (id)
    on delete restrict,
  constraint venta_detalles_precio_fk
    foreign key (precio_producto_id)
    references public.precios_producto (id)
    on delete restrict,
  constraint venta_detalles_linea_unica
    unique (venta_id, numero_linea),
  constraint venta_detalles_producto_unico
    unique (venta_id, variante_id, presentacion_id),
  constraint venta_detalles_numero_linea_check
    check (numero_linea between 1 and 100),
  constraint venta_detalles_producto_codigo_check
    check (
      producto_codigo_snapshot = upper(btrim(producto_codigo_snapshot))
      and producto_codigo_snapshot ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  constraint venta_detalles_producto_nombre_check
    check (btrim(producto_nombre_snapshot) <> ''),
  constraint venta_detalles_sku_check
    check (
      codigo_sku_snapshot = upper(btrim(codigo_sku_snapshot))
      and codigo_sku_snapshot ~
        '^[A-Z0-9][A-Z0-9._-]{1,78}[A-Z0-9]$'
    ),
  constraint venta_detalles_color_check
    check (btrim(color_snapshot) <> ''),
  constraint venta_detalles_longitud_check
    check (longitud_cm_snapshot > 0),
  constraint venta_detalles_clasificacion_check
    check (clasificacion_snapshot in ('normal', 'completa', 'premium')),
  constraint venta_detalles_presentacion_codigo_check
    check (
      presentacion_codigo_snapshot = lower(
        btrim(presentacion_codigo_snapshot)
      )
      and presentacion_codigo_snapshot ~ '^[a-z0-9][a-z0-9_]*$'
    ),
  constraint venta_detalles_presentacion_nombre_check
    check (btrim(presentacion_nombre_snapshot) <> ''),
  constraint venta_detalles_cantidades_check
    check (
      cantidad_manojos_presentacion > 0
      and cantidad_presentaciones between 1 and 1000000
      and cantidad_manojos > 0
      and cantidad_manojos =
        cantidad_manojos_presentacion::bigint
        * cantidad_presentaciones::bigint
    ),
  constraint venta_detalles_precio_check
    check (precio_unitario >= 0),
  constraint venta_detalles_subtotal_check
    check (
      subtotal >= 0
      and subtotal = round(
        cantidad_presentaciones::numeric * precio_unitario,
        2
      )
    )
);

create table public.recibos (
  id uuid not null default gen_random_uuid(),
  venta_id uuid not null,
  correlativo bigint not null default nextval(
    'public.recibos_correlativo_seq'::regclass
  ),
  serie_usuario_snapshot varchar(8) not null,
  numero varchar(40) generated always as (
    'REC-' || serie_usuario_snapshot || '-' || case
      when correlativo < 1000000
        then lpad(correlativo::text, 6, '0')
      else correlativo::text
    end
  ) stored,
  usuario_emisor uuid not null,
  fecha_emision timestamptz not null default now(),
  constraint recibos_pk primary key (id),
  constraint recibos_venta_unica unique (venta_id),
  constraint recibos_correlativo_unico unique (correlativo),
  constraint recibos_numero_unico unique (numero),
  constraint recibos_venta_fk
    foreign key (venta_id)
    references public.ventas (id)
    on delete restrict,
  constraint recibos_usuario_emisor_fk
    foreign key (usuario_emisor)
    references public.perfiles (id)
    on delete restrict,
  constraint recibos_correlativo_check
    check (correlativo > 0),
  constraint recibos_serie_usuario_check
    check (
      serie_usuario_snapshot = upper(btrim(serie_usuario_snapshot))
      and serie_usuario_snapshot ~ '^[A-Z0-9]{1,8}$'
    ),
  constraint recibos_numero_check
    check (numero ~ '^REC-[A-Z0-9]{1,8}-[0-9]{6,}$')
);

alter sequence public.recibos_correlativo_seq
  owned by public.recibos.correlativo;

create index indice_ventas_estado_fecha
  on public.ventas (estado, fecha_confirmacion desc, id desc);
create index indice_ventas_cliente
  on public.ventas (cliente_id)
  where cliente_id is not null;
create index indice_ventas_usuario_fecha
  on public.ventas (usuario_creador, fecha_confirmacion desc);
create index indice_venta_detalles_variante
  on public.venta_detalles (variante_id);
create index indice_venta_detalles_presentacion
  on public.venta_detalles (presentacion_id);
create index indice_venta_detalles_precio
  on public.venta_detalles (precio_producto_id);
create index indice_recibos_usuario_fecha
  on public.recibos (usuario_emisor, fecha_emision desc);

-- Cada Venta genera como máximo un movimiento agregado por variante y fase.
create unique index movimientos_inventario_venta_unico
  on public.movimientos_inventario (
    referencia_id,
    variante_id,
    origen
  )
  where referencia_id is not null
    and origen in ('venta', 'anulacion_venta');

alter table public.ventas enable row level security;
alter table public.venta_detalles enable row level security;
alter table public.recibos enable row level security;

revoke all privileges on sequence public.ventas_correlativo_seq
  from public;
revoke all privileges on sequence public.ventas_correlativo_seq
  from anon;
revoke all privileges on sequence public.ventas_correlativo_seq
  from authenticated;
revoke all privileges on sequence public.ventas_correlativo_seq
  from service_role;

revoke all privileges on sequence public.recibos_correlativo_seq
  from public;
revoke all privileges on sequence public.recibos_correlativo_seq
  from anon;
revoke all privileges on sequence public.recibos_correlativo_seq
  from authenticated;
revoke all privileges on sequence public.recibos_correlativo_seq
  from service_role;


-- Helper interno. El Recibo documenta la Venta, pero no duplica sus snapshots.
create function public.crear_recibo_venta(
  p_venta_id uuid,
  p_usuario_id uuid,
  p_serie_usuario text
)
returns public.recibos
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_recibo public.recibos%rowtype;
  v_restriccion text;
begin
  if p_venta_id is null
    or p_usuario_id is null
    or p_serie_usuario is null
    or p_serie_usuario <> upper(btrim(p_serie_usuario))
    or p_serie_usuario !~ '^[A-Z0-9]{1,8}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if not exists (
    select 1
    from public.ventas as venta
    where venta.id = p_venta_id
      and venta.estado = 'confirmada'
  ) then
    raise exception using
      errcode = '23514',
      message = 'La Venta no admite la emisión de un Recibo.';
  end if;

  insert into public.recibos (
    venta_id,
    serie_usuario_snapshot,
    usuario_emisor
  )
  values (
    p_venta_id,
    p_serie_usuario,
    p_usuario_id
  )
  returning * into v_recibo;

  return v_recibo;
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'recibos_venta_unica' then
      raise exception using
        errcode = '23505',
        message = 'La Venta ya tiene un Recibo asociado.';
    end if;

    raise;
end;
$funcion$;

revoke execute on function public.crear_recibo_venta(uuid, uuid, text)
  from public;
revoke execute on function public.crear_recibo_venta(uuid, uuid, text)
  from anon;
revoke execute on function public.crear_recibo_venta(uuid, uuid, text)
  from authenticated;
revoke execute on function public.crear_recibo_venta(uuid, uuid, text)
  from service_role;


-- Bloquea primero todas las variantes y después todas las existencias, siempre
-- en orden UUID. Las cantidades se agrupan por variante antes de validarse.
create function public.descontar_inventario_venta(
  p_venta_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_requerimiento record;
  v_existencia public.inventario_existencias%rowtype;
  v_numero_venta text;
begin
  if p_venta_id is null or p_usuario_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select venta.numero
  into v_numero_venta
  from public.ventas as venta
  where venta.id = p_venta_id;

  if not found
    or not exists (
      select 1
      from public.venta_detalles as detalle
      where detalle.venta_id = p_venta_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La Venta no tiene un detalle válido.';
  end if;

  perform variante.id
  from public.producto_variantes as variante
  where exists (
    select 1
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
      and detalle.variante_id = variante.id
  )
  order by variante.id
  for no key update of variante;

  insert into public.inventario_existencias (variante_id)
  select requerimiento.variante_id
  from (
    select detalle.variante_id
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
    group by detalle.variante_id
  ) as requerimiento
  order by requerimiento.variante_id
  on conflict (variante_id) do nothing;

  perform existencia.variante_id
  from public.inventario_existencias as existencia
  where exists (
    select 1
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
      and detalle.variante_id = existencia.variante_id
  )
  order by existencia.variante_id
  for update of existencia;

  -- Primero se valida el conjunto completo; después se modifica el stock.
  for v_requerimiento in
    select
      detalle.variante_id,
      sum(detalle.cantidad_manojos) as cantidad_manojos
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
    group by detalle.variante_id
    order by detalle.variante_id
  loop
    select existencia.*
    into v_existencia
    from public.inventario_existencias as existencia
    where existencia.variante_id = v_requerimiento.variante_id;

    if not found
      or v_requerimiento.cantidad_manojos > v_existencia.stock_manojos
    then
      raise exception using
        errcode = '23514',
        message = 'No hay stock suficiente para completar la Venta.';
    end if;
  end loop;

  for v_requerimiento in
    select
      detalle.variante_id,
      sum(detalle.cantidad_manojos) as cantidad_manojos
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
    group by detalle.variante_id
    order by detalle.variante_id
  loop
    select existencia.*
    into v_existencia
    from public.inventario_existencias as existencia
    where existencia.variante_id = v_requerimiento.variante_id;

    update public.inventario_existencias as existencia
    set
      stock_manojos =
        v_existencia.stock_manojos
        - v_requerimiento.cantidad_manojos::integer,
      fecha_actualizacion = now()
    where existencia.variante_id = v_requerimiento.variante_id;

    insert into public.movimientos_inventario (
      variante_id,
      tipo,
      variacion_manojos,
      saldo_anterior,
      saldo_posterior,
      motivo,
      origen,
      referencia_id,
      usuario_id
    )
    values (
      v_requerimiento.variante_id,
      'salida',
      -v_requerimiento.cantidad_manojos::integer,
      v_existencia.stock_manojos,
      v_existencia.stock_manojos
        - v_requerimiento.cantidad_manojos::integer,
      'Venta ' || v_numero_venta,
      'venta',
      p_venta_id,
      p_usuario_id
    );
  end loop;
end;
$funcion$;

revoke execute on function public.descontar_inventario_venta(uuid, uuid)
  from public;
revoke execute on function public.descontar_inventario_venta(uuid, uuid)
  from anon;
revoke execute on function public.descontar_inventario_venta(uuid, uuid)
  from authenticated;
revoke execute on function public.descontar_inventario_venta(uuid, uuid)
  from service_role;


create function public.reintegrar_inventario_venta(
  p_venta_id uuid,
  p_usuario_id uuid,
  p_motivo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_requerimiento record;
  v_existencia public.inventario_existencias%rowtype;
  v_numero_venta text;
  v_saldo_posterior bigint;
begin
  if p_venta_id is null
    or p_usuario_id is null
    or p_motivo is null
    or btrim(p_motivo) = ''
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select venta.numero
  into v_numero_venta
  from public.ventas as venta
  where venta.id = p_venta_id;

  if not found
    or not exists (
      select 1
      from public.venta_detalles as detalle
      where detalle.venta_id = p_venta_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La Venta no tiene un detalle válido.';
  end if;

  perform variante.id
  from public.producto_variantes as variante
  where exists (
    select 1
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
      and detalle.variante_id = variante.id
  )
  order by variante.id
  for no key update of variante;

  perform existencia.variante_id
  from public.inventario_existencias as existencia
  where exists (
    select 1
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
      and detalle.variante_id = existencia.variante_id
  )
  order by existencia.variante_id
  for update of existencia;

  for v_requerimiento in
    select
      detalle.variante_id,
      sum(detalle.cantidad_manojos) as cantidad_manojos
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
    group by detalle.variante_id
    order by detalle.variante_id
  loop
    select existencia.*
    into v_existencia
    from public.inventario_existencias as existencia
    where existencia.variante_id = v_requerimiento.variante_id;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'La existencia original de la Venta no está disponible.';
    end if;

    v_saldo_posterior :=
      v_existencia.stock_manojos::bigint
      + v_requerimiento.cantidad_manojos;

    if v_saldo_posterior > 2147483647 then
      raise exception using
        errcode = '22003',
        message = 'El reintegro de stock excede el límite permitido.';
    end if;
  end loop;

  for v_requerimiento in
    select
      detalle.variante_id,
      sum(detalle.cantidad_manojos) as cantidad_manojos
    from public.venta_detalles as detalle
    where detalle.venta_id = p_venta_id
    group by detalle.variante_id
    order by detalle.variante_id
  loop
    select existencia.*
    into v_existencia
    from public.inventario_existencias as existencia
    where existencia.variante_id = v_requerimiento.variante_id;

    v_saldo_posterior :=
      v_existencia.stock_manojos::bigint
      + v_requerimiento.cantidad_manojos;

    update public.inventario_existencias as existencia
    set
      stock_manojos = v_saldo_posterior::integer,
      fecha_actualizacion = now()
    where existencia.variante_id = v_requerimiento.variante_id;

    insert into public.movimientos_inventario (
      variante_id,
      tipo,
      variacion_manojos,
      saldo_anterior,
      saldo_posterior,
      motivo,
      origen,
      referencia_id,
      usuario_id
    )
    values (
      v_requerimiento.variante_id,
      'entrada',
      v_requerimiento.cantidad_manojos::integer,
      v_existencia.stock_manojos,
      v_saldo_posterior::integer,
      'Anulación ' || v_numero_venta || ': ' || p_motivo,
      'anulacion_venta',
      p_venta_id,
      p_usuario_id
    );
  end loop;
end;
$funcion$;

revoke execute
  on function public.reintegrar_inventario_venta(uuid, uuid, text)
  from public;
revoke execute
  on function public.reintegrar_inventario_venta(uuid, uuid, text)
  from anon;
revoke execute
  on function public.reintegrar_inventario_venta(uuid, uuid, text)
  from authenticated;
revoke execute
  on function public.reintegrar_inventario_venta(uuid, uuid, text)
  from service_role;


-- Confirma una Venta directa. La clave de idempotencia debe conservarse al
-- reintentar la misma confirmación después de un timeout de red.
create function public.confirmar_venta(
  p_clave_idempotencia uuid,
  p_cliente_id uuid,
  p_comprador_nombre text,
  p_comprador_nit text,
  p_comprador_direccion text,
  p_observaciones text,
  p_detalles jsonb,
  p_generar_recibo boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_serie_usuario varchar(8);
  v_tipo_comprador text;
  v_comprador_nombre text;
  v_comprador_nit text;
  v_comprador_direccion text;
  v_observaciones text;
  v_venta public.ventas%rowtype;
  v_recibo public.recibos%rowtype;
  v_detalle jsonb;
  v_numero_linea bigint;
  v_variante_id uuid;
  v_presentacion_id uuid;
  v_cantidad_presentaciones integer;
  v_variantes uuid[] := '{}'::uuid[];
  v_claves_detalle text[] := '{}'::text[];
  v_clave_detalle text;
  v_variantes_bloqueadas bigint;
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
begin
  if not public.usuario_actual_tiene_permiso('venta.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_clave_idempotencia is null
    or p_generar_recibo is null
    or p_detalles is null
    or jsonb_typeof(p_detalles) <> 'array'
    or jsonb_array_length(p_detalles) < 1
    or jsonb_array_length(p_detalles) > 100
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

  -- Serializa únicamente reintentos que comparten la misma clave.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_clave_idempotencia::text, 0)
  );

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.clave_idempotencia = p_clave_idempotencia;

  if found then
    if v_venta.usuario_creador <> v_usuario_id then
      raise exception using
        errcode = '23505',
        message = 'La clave de idempotencia ya fue utilizada.';
    end if;

    select recibo.*
    into v_recibo
    from public.recibos as recibo
    where recibo.venta_id = v_venta.id;

    return jsonb_build_object(
      'cambio', false,
      'venta', jsonb_build_object(
        'id', v_venta.id,
        'numero', v_venta.numero,
        'estado', v_venta.estado,
        'subtotal', v_venta.subtotal,
        'total', v_venta.total,
        'fecha_confirmacion', v_venta.fecha_confirmacion
      ),
      'recibo', case
        when v_recibo.id is null then null
        else jsonb_build_object(
          'id', v_recibo.id,
          'numero', v_recibo.numero,
          'fecha_emision', v_recibo.fecha_emision
        )
      end
    );
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

  -- Valida todo el JSON antes de tomar locks o crear la Venta.
  for v_detalle in
    select detalle.valor
    from jsonb_array_elements(p_detalles) as detalle(valor)
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

    if v_clave_detalle = any(v_claves_detalle) then
      raise exception using
        errcode = '23505',
        message = 'No se permiten líneas duplicadas en una Venta.';
    end if;

    v_claves_detalle := array_append(v_claves_detalle, v_clave_detalle);

    if not (v_variante_id = any(v_variantes)) then
      v_variantes := array_append(v_variantes, v_variante_id);
    end if;
  end loop;

  -- NO KEY UPDATE se serializa con Inventario y precios, pero es compatible
  -- con el KEY SHARE usado al preparar borradores de Cotización.
  perform variante.id
  from public.producto_variantes as variante
  join public.productos as producto
    on producto.id = variante.producto_id
  where variante.id = any(v_variantes)
    and producto.codigo = 'SNAPDRAGON'
    and producto.activo is true
    and variante.activo is true
  order by variante.id
  for no key update of variante;

  get diagnostics v_variantes_bloqueadas = row_count;

  if v_variantes_bloqueadas <> cardinality(v_variantes) then
    raise exception using
      errcode = 'P0002',
      message = 'Una variante solicitada no existe o no está activa.';
  end if;

  insert into public.ventas (
    serie_usuario_snapshot,
    origen,
    clave_idempotencia,
    cliente_id,
    tipo_comprador,
    comprador_nombre,
    comprador_nit,
    comprador_direccion,
    subtotal,
    total,
    observaciones,
    usuario_creador
  )
  values (
    v_serie_usuario,
    'directa',
    p_clave_idempotencia,
    p_cliente_id,
    v_tipo_comprador,
    v_comprador_nombre,
    v_comprador_nit,
    v_comprador_direccion,
    0,
    0,
    v_observaciones,
    v_usuario_id
  )
  returning * into v_venta;

  for v_detalle, v_numero_linea in
    select
      detalle.valor,
      detalle.numero_linea
    from jsonb_array_elements(p_detalles)
      with ordinality as detalle(valor, numero_linea)
    order by detalle.numero_linea
  loop
    v_variante_id := (v_detalle ->> 'variante_id')::uuid;
    v_presentacion_id := (v_detalle ->> 'presentacion_id')::uuid;
    v_cantidad_presentaciones :=
      (v_detalle ->> 'cantidad_presentaciones')::integer;

    select
      producto.codigo,
      producto.nombre,
      producto.descripcion,
      variante.codigo_sku,
      variante.color,
      variante.longitud_cm,
      variante.clasificacion,
      presentacion.codigo,
      presentacion.nombre,
      presentacion.cantidad_manojos,
      precio.id,
      precio.precio
    into
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
      v_precio_producto_id,
      v_precio_unitario
    from public.producto_variantes as variante
    join public.productos as producto
      on producto.id = variante.producto_id
    join public.precios_producto as precio
      on precio.variante_id = variante.id
      and precio.vigente_hasta is null
    join public.presentaciones_producto as presentacion
      on presentacion.id = precio.presentacion_id
    where variante.id = v_variante_id
      and presentacion.id = v_presentacion_id
      and producto.codigo = 'SNAPDRAGON'
      and producto.activo is true
      and variante.activo is true
      and presentacion.activo is true;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'No existe un precio vigente para una línea solicitada.';
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
        message = 'El total de la Venta excede el límite permitido.';
    end if;

    insert into public.venta_detalles (
      venta_id,
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
      v_venta.id,
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

  update public.ventas as venta
  set
    subtotal = v_total,
    total = v_total,
    fecha_actualizacion = now()
  where venta.id = v_venta.id
  returning venta.* into v_venta;

  perform public.descontar_inventario_venta(v_venta.id, v_usuario_id);

  if p_generar_recibo then
    v_recibo := public.crear_recibo_venta(
      v_venta.id,
      v_usuario_id,
      v_serie_usuario
    );
  end if;

  return jsonb_build_object(
    'cambio', true,
    'venta', jsonb_build_object(
      'id', v_venta.id,
      'numero', v_venta.numero,
      'estado', v_venta.estado,
      'subtotal', v_venta.subtotal,
      'total', v_venta.total,
      'fecha_confirmacion', v_venta.fecha_confirmacion
    ),
    'recibo', case
      when v_recibo.id is null then null
      else jsonb_build_object(
        'id', v_recibo.id,
        'numero', v_recibo.numero,
        'fecha_emision', v_recibo.fecha_emision
      )
    end
  );
end;
$funcion$;

revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from public;
revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from anon;
revoke execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  from service_role;
grant execute
  on function public.confirmar_venta(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb,
    boolean
  )
  to authenticated;


-- La conversión conserva literalmente los snapshots y precios de la
-- Cotización emitida. No consulta ni sustituye el precio vigente actual.
create function public.convertir_cotizacion_venta(
  p_cotizacion_id uuid,
  p_generar_recibo boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_serie_usuario varchar(8);
  v_cotizacion public.cotizaciones%rowtype;
  v_venta public.ventas%rowtype;
  v_recibo public.recibos%rowtype;
  v_cantidad_detalles bigint;
  v_detalles_insertados bigint;
  v_total_detalles numeric;
  v_restriccion text;
begin
  if not public.usuario_actual_tiene_permiso('cotizacion.convertir') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_cotizacion_id is null or p_generar_recibo is null then
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

  select cotizacion.*
  into v_cotizacion
  from public.cotizaciones as cotizacion
  where cotizacion.id = p_cotizacion_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Cotización solicitada no existe.';
  end if;

  if v_cotizacion.estado = 'convertida' then
    raise exception using
      errcode = '23505',
      message = 'La Cotización ya fue convertida en Venta.';
  end if;

  if v_cotizacion.estado <> 'emitida' then
    raise exception using
      errcode = '23514',
      message = 'Solo una Cotización emitida puede convertirse en Venta.';
  end if;

  select
    count(*),
    coalesce(sum(detalle.subtotal), 0)
  into
    v_cantidad_detalles,
    v_total_detalles
  from public.cotizacion_detalles as detalle
  where detalle.cotizacion_id = p_cotizacion_id;

  if v_cantidad_detalles < 1
    or v_cotizacion.total <= 0
    or v_cotizacion.subtotal <> v_cotizacion.total
    or v_total_detalles <> v_cotizacion.total
  then
    raise exception using
      errcode = '23514',
      message = 'La Cotización no tiene un detalle válido para convertirse.';
  end if;

  -- Los INSERT de detalles también comprueban FKs. Se bloquean antes todas
  -- las variantes en orden para que esas comprobaciones no inviertan el orden
  -- de locks usado por Inventario y por los cambios de precio.
  perform variante.id
  from public.producto_variantes as variante
  where exists (
    select 1
    from public.cotizacion_detalles as detalle
    where detalle.cotizacion_id = p_cotizacion_id
      and detalle.variante_id = variante.id
  )
  order by variante.id
  for no key update of variante;

  insert into public.ventas (
    serie_usuario_snapshot,
    origen,
    cotizacion_id,
    cliente_id,
    tipo_comprador,
    comprador_nombre,
    comprador_nit,
    comprador_direccion,
    subtotal,
    total,
    observaciones,
    usuario_creador
  )
  values (
    v_serie_usuario,
    'cotizacion',
    v_cotizacion.id,
    v_cotizacion.cliente_id,
    v_cotizacion.tipo_comprador,
    v_cotizacion.comprador_nombre,
    v_cotizacion.comprador_nit,
    v_cotizacion.comprador_direccion,
    v_cotizacion.subtotal,
    v_cotizacion.total,
    v_cotizacion.observaciones,
    v_usuario_id
  )
  returning * into v_venta;

  insert into public.venta_detalles (
    venta_id,
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
  select
    v_venta.id,
    detalle.numero_linea,
    detalle.variante_id,
    detalle.presentacion_id,
    detalle.precio_producto_id,
    detalle.producto_codigo_snapshot,
    detalle.producto_nombre_snapshot,
    detalle.producto_descripcion_snapshot,
    detalle.codigo_sku_snapshot,
    detalle.color_snapshot,
    detalle.longitud_cm_snapshot,
    detalle.clasificacion_snapshot,
    detalle.presentacion_codigo_snapshot,
    detalle.presentacion_nombre_snapshot,
    detalle.cantidad_manojos_presentacion,
    detalle.cantidad_presentaciones,
    detalle.cantidad_manojos,
    detalle.precio_unitario,
    detalle.subtotal
  from public.cotizacion_detalles as detalle
  where detalle.cotizacion_id = p_cotizacion_id
  order by detalle.numero_linea;

  get diagnostics v_detalles_insertados = row_count;

  if v_detalles_insertados <> v_cantidad_detalles then
    raise exception using
      errcode = '23514',
      message = 'La Cotización no pudo copiarse de forma íntegra.';
  end if;

  perform public.descontar_inventario_venta(v_venta.id, v_usuario_id);

  if p_generar_recibo then
    v_recibo := public.crear_recibo_venta(
      v_venta.id,
      v_usuario_id,
      v_serie_usuario
    );
  end if;

  update public.cotizaciones as cotizacion
  set
    estado = 'convertida',
    usuario_actualizacion = v_usuario_id,
    fecha_conversion = now(),
    fecha_actualizacion = now()
  where cotizacion.id = p_cotizacion_id;

  return jsonb_build_object(
    'venta', jsonb_build_object(
      'id', v_venta.id,
      'numero', v_venta.numero,
      'estado', v_venta.estado,
      'subtotal', v_venta.subtotal,
      'total', v_venta.total,
      'cotizacion_id', v_venta.cotizacion_id,
      'fecha_confirmacion', v_venta.fecha_confirmacion
    ),
    'recibo', case
      when v_recibo.id is null then null
      else jsonb_build_object(
        'id', v_recibo.id,
        'numero', v_recibo.numero,
        'fecha_emision', v_recibo.fecha_emision
      )
    end
  );
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'ventas_cotizacion_unica' then
      raise exception using
        errcode = '23505',
        message = 'La Cotización ya fue convertida en Venta.';
    end if;

    raise;
end;
$funcion$;

revoke execute
  on function public.convertir_cotizacion_venta(uuid, boolean)
  from public;
revoke execute
  on function public.convertir_cotizacion_venta(uuid, boolean)
  from anon;
revoke execute
  on function public.convertir_cotizacion_venta(uuid, boolean)
  from service_role;
grant execute
  on function public.convertir_cotizacion_venta(uuid, boolean)
  to authenticated;


-- Permite emitir el Recibo después de confirmar la Venta. Si ya existe,
-- devuelve el mismo documento y no consume otro correlativo.
create function public.generar_recibo_venta(
  p_venta_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_serie_usuario varchar(8);
  v_venta public.ventas%rowtype;
  v_recibo public.recibos%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('venta.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_venta_id is null then
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

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  select recibo.*
  into v_recibo
  from public.recibos as recibo
  where recibo.venta_id = p_venta_id;

  if found then
    return jsonb_build_object(
      'cambio', false,
      'recibo', jsonb_build_object(
        'id', v_recibo.id,
        'venta_id', v_recibo.venta_id,
        'numero', v_recibo.numero,
        'correlativo', v_recibo.correlativo,
        'serie_usuario_snapshot', v_recibo.serie_usuario_snapshot,
        'fecha_emision', v_recibo.fecha_emision
      )
    );
  end if;

  if v_venta.estado <> 'confirmada' then
    raise exception using
      errcode = '23514',
      message = 'La Venta no admite la emisión de un Recibo.';
  end if;

  if v_serie_usuario is null then
    raise exception using
      errcode = '23514',
      message = 'El usuario no tiene una serie de documentos asignada.';
  end if;

  v_recibo := public.crear_recibo_venta(
    p_venta_id,
    v_usuario_id,
    v_serie_usuario
  );

  return jsonb_build_object(
    'cambio', true,
    'recibo', jsonb_build_object(
      'id', v_recibo.id,
      'venta_id', v_recibo.venta_id,
      'numero', v_recibo.numero,
      'correlativo', v_recibo.correlativo,
      'serie_usuario_snapshot', v_recibo.serie_usuario_snapshot,
      'fecha_emision', v_recibo.fecha_emision
    )
  );
end;
$funcion$;

revoke execute on function public.generar_recibo_venta(uuid)
  from public;
revoke execute on function public.generar_recibo_venta(uuid)
  from anon;
revoke execute on function public.generar_recibo_venta(uuid)
  from service_role;
grant execute on function public.generar_recibo_venta(uuid)
  to authenticated;


-- Anular conserva toda la evidencia original y registra entradas inversas.
-- Una segunda llamada devuelve la Venta ya anulada sin duplicar movimientos.
create function public.anular_venta(
  p_venta_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_motivo text;
  v_venta public.ventas%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('venta.anular') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_venta_id is null
    or v_motivo is null
    or char_length(v_motivo) > 400
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

  perform 1
  from public.perfiles as perfil
  where perfil.id = v_usuario_id
    and perfil.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  if v_venta.estado = 'anulada' then
    return jsonb_build_object(
      'cambio', false,
      'venta', jsonb_build_object(
        'id', v_venta.id,
        'numero', v_venta.numero,
        'estado', v_venta.estado,
        'motivo_anulacion', v_venta.motivo_anulacion,
        'fecha_anulacion', v_venta.fecha_anulacion
      )
    );
  end if;

  if v_venta.estado <> 'confirmada' then
    raise exception using
      errcode = '23514',
      message = 'La Venta no puede anularse en su estado actual.';
  end if;

  perform public.reintegrar_inventario_venta(
    p_venta_id,
    v_usuario_id,
    v_motivo
  );

  update public.ventas as venta
  set
    estado = 'anulada',
    usuario_anulacion = v_usuario_id,
    motivo_anulacion = v_motivo,
    fecha_anulacion = now(),
    fecha_actualizacion = now()
  where venta.id = p_venta_id
  returning venta.* into v_venta;

  return jsonb_build_object(
    'cambio', true,
    'venta', jsonb_build_object(
      'id', v_venta.id,
      'numero', v_venta.numero,
      'estado', v_venta.estado,
      'motivo_anulacion', v_venta.motivo_anulacion,
      'fecha_anulacion', v_venta.fecha_anulacion
    )
  );
end;
$funcion$;

revoke execute on function public.anular_venta(uuid, text)
  from public;
revoke execute on function public.anular_venta(uuid, text)
  from anon;
revoke execute on function public.anular_venta(uuid, text)
  from service_role;
grant execute on function public.anular_venta(uuid, text)
  to authenticated;


create function public.listar_ventas(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_estado text default null,
  p_tipo_documento text default null,
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
  v_busqueda_nit text;
  v_estado text;
  v_tipo_documento text;
  v_total bigint;
  v_ventas jsonb;
begin
  if not public.usuario_actual_tiene_permiso('venta.ver') then
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
  v_tipo_documento := nullif(lower(btrim(p_tipo_documento)), '');

  if char_length(v_busqueda) > 200
    or (
      v_estado is not null
      and v_estado not in ('confirmada', 'anulada')
    )
    or (
      v_tipo_documento is not null
      and v_tipo_documento not in ('recibo', 'sin_documento')
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.ventas as venta
  join public.perfiles as creador
    on creador.id = venta.usuario_creador
  left join public.recibos as recibo
    on recibo.venta_id = venta.id
  where (v_estado is null or venta.estado = v_estado)
    and (p_usuario_id is null or venta.usuario_creador = p_usuario_id)
    and (
      v_tipo_documento is null
      or (v_tipo_documento = 'recibo' and recibo.id is not null)
      or (v_tipo_documento = 'sin_documento' and recibo.id is null)
    )
    and (
      p_fecha_desde is null
      or venta.fecha_confirmacion >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      p_fecha_hasta is null
      or venta.fecha_confirmacion < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      v_busqueda is null
      or strpos(lower(venta.numero), lower(v_busqueda)) > 0
      or strpos(
        lower(venta.comprador_nombre),
        lower(v_busqueda)
      ) > 0
      or (
        v_busqueda_nit is not null
        and strpos(venta.comprador_nit, v_busqueda_nit) > 0
      )
      or strpos(
        lower(venta.serie_usuario_snapshot),
        lower(v_busqueda)
      ) > 0
      or strpos(lower(creador.nombre_completo), lower(v_busqueda)) > 0
      or (
        recibo.id is not null
        and strpos(lower(recibo.numero), lower(v_busqueda)) > 0
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'numero', pagina.numero,
        'correlativo', pagina.correlativo,
        'serie_usuario_snapshot', pagina.serie_usuario_snapshot,
        'origen', pagina.origen,
        'cotizacion_id', pagina.cotizacion_id,
        'cliente_id', pagina.cliente_id,
        'tipo_comprador', pagina.tipo_comprador,
        'comprador_nombre', pagina.comprador_nombre,
        'comprador_nit', pagina.comprador_nit,
        'estado', pagina.estado,
        'subtotal', pagina.subtotal,
        'total', pagina.total,
        'tipo_documento', case
          when pagina.recibo_id is null then 'sin_documento'
          else 'recibo'
        end,
        'recibo', case
          when pagina.recibo_id is null then null
          else jsonb_build_object(
            'id', pagina.recibo_id,
            'numero', pagina.recibo_numero,
            'fecha_emision', pagina.recibo_fecha_emision
          )
        end,
        'usuario_creador', jsonb_build_object(
          'id', pagina.usuario_creador,
          'nombre_completo', pagina.nombre_usuario_creador
        ),
        'fecha_confirmacion', pagina.fecha_confirmacion,
        'fecha_anulacion', pagina.fecha_anulacion,
        'fecha_actualizacion', pagina.fecha_actualizacion
      )
      order by pagina.fecha_confirmacion desc, pagina.id desc
    ),
    '[]'::jsonb
  )
  into v_ventas
  from (
    select
      venta.*,
      creador.nombre_completo as nombre_usuario_creador,
      recibo.id as recibo_id,
      recibo.numero as recibo_numero,
      recibo.fecha_emision as recibo_fecha_emision
    from public.ventas as venta
    join public.perfiles as creador
      on creador.id = venta.usuario_creador
    left join public.recibos as recibo
      on recibo.venta_id = venta.id
    where (v_estado is null or venta.estado = v_estado)
      and (p_usuario_id is null or venta.usuario_creador = p_usuario_id)
      and (
        v_tipo_documento is null
        or (v_tipo_documento = 'recibo' and recibo.id is not null)
        or (v_tipo_documento = 'sin_documento' and recibo.id is null)
      )
      and (
        p_fecha_desde is null
        or venta.fecha_confirmacion >= (
          p_fecha_desde::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        p_fecha_hasta is null
        or venta.fecha_confirmacion < (
          (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        v_busqueda is null
        or strpos(lower(venta.numero), lower(v_busqueda)) > 0
        or strpos(
          lower(venta.comprador_nombre),
          lower(v_busqueda)
        ) > 0
        or (
          v_busqueda_nit is not null
          and strpos(venta.comprador_nit, v_busqueda_nit) > 0
        )
        or strpos(
          lower(venta.serie_usuario_snapshot),
          lower(v_busqueda)
        ) > 0
        or strpos(lower(creador.nombre_completo), lower(v_busqueda)) > 0
        or (
          recibo.id is not null
          and strpos(lower(recibo.numero), lower(v_busqueda)) > 0
        )
      )
    order by venta.fecha_confirmacion desc, venta.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'ventas', v_ventas,
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
  on function public.listar_ventas(
    integer,
    integer,
    text,
    text,
    text,
    date,
    date,
    uuid
  )
  from public;
revoke execute
  on function public.listar_ventas(
    integer,
    integer,
    text,
    text,
    text,
    date,
    date,
    uuid
  )
  from anon;
revoke execute
  on function public.listar_ventas(
    integer,
    integer,
    text,
    text,
    text,
    date,
    date,
    uuid
  )
  from service_role;
grant execute
  on function public.listar_ventas(
    integer,
    integer,
    text,
    text,
    text,
    date,
    date,
    uuid
  )
  to authenticated;


create function public.obtener_venta(
  p_venta_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_venta jsonb;
  v_recibo jsonb;
  v_detalles jsonb;
  v_movimientos jsonb;
begin
  if not public.usuario_actual_tiene_permiso('venta.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_venta_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select jsonb_build_object(
    'id', venta.id,
    'numero', venta.numero,
    'correlativo', venta.correlativo,
    'serie_usuario_snapshot', venta.serie_usuario_snapshot,
    'origen', venta.origen,
    'cotizacion_id', venta.cotizacion_id,
    'cliente_id', venta.cliente_id,
    'tipo_comprador', venta.tipo_comprador,
    'comprador_nombre', venta.comprador_nombre,
    'comprador_nit', venta.comprador_nit,
    'comprador_direccion', venta.comprador_direccion,
    'estado', venta.estado,
    'subtotal', venta.subtotal,
    'total', venta.total,
    'observaciones', venta.observaciones,
    'usuario_creador', jsonb_build_object(
      'id', creador.id,
      'nombre_completo', creador.nombre_completo
    ),
    'usuario_anulacion', case
      when anulador.id is null then null
      else jsonb_build_object(
        'id', anulador.id,
        'nombre_completo', anulador.nombre_completo
      )
    end,
    'motivo_anulacion', venta.motivo_anulacion,
    'fecha_confirmacion', venta.fecha_confirmacion,
    'fecha_anulacion', venta.fecha_anulacion,
    'fecha_actualizacion', venta.fecha_actualizacion
  )
  into v_venta
  from public.ventas as venta
  join public.perfiles as creador
    on creador.id = venta.usuario_creador
  left join public.perfiles as anulador
    on anulador.id = venta.usuario_anulacion
  where venta.id = p_venta_id;

  if v_venta is null then
    raise exception using
      errcode = 'P0002',
      message = 'La Venta solicitada no existe.';
  end if;

  select jsonb_build_object(
    'id', recibo.id,
    'numero', recibo.numero,
    'correlativo', recibo.correlativo,
    'serie_usuario_snapshot', recibo.serie_usuario_snapshot,
    'usuario_emisor', jsonb_build_object(
      'id', emisor.id,
      'nombre_completo', emisor.nombre_completo
    ),
    'fecha_emision', recibo.fecha_emision
  )
  into v_recibo
  from public.recibos as recibo
  join public.perfiles as emisor
    on emisor.id = recibo.usuario_emisor
  where recibo.venta_id = p_venta_id;

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
  from public.venta_detalles as detalle
  where detalle.venta_id = p_venta_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', movimiento.id,
        'variante_id', movimiento.variante_id,
        'tipo', movimiento.tipo,
        'variacion_manojos', movimiento.variacion_manojos,
        'saldo_anterior', movimiento.saldo_anterior,
        'saldo_posterior', movimiento.saldo_posterior,
        'motivo', movimiento.motivo,
        'origen', movimiento.origen,
        'usuario', jsonb_build_object(
          'id', perfil.id,
          'nombre_completo', perfil.nombre_completo
        ),
        'fecha_movimiento', movimiento.fecha_movimiento
      )
      order by movimiento.fecha_movimiento, movimiento.id
    ),
    '[]'::jsonb
  )
  into v_movimientos
  from public.movimientos_inventario as movimiento
  join public.perfiles as perfil
    on perfil.id = movimiento.usuario_id
  where movimiento.referencia_id = p_venta_id
    and movimiento.origen in ('venta', 'anulacion_venta');

  return jsonb_build_object(
    'venta', v_venta,
    'recibo', v_recibo,
    'detalles', v_detalles,
    'movimientos_inventario', v_movimientos
  );
end;
$funcion$;

revoke execute on function public.obtener_venta(uuid)
  from public;
revoke execute on function public.obtener_venta(uuid)
  from anon;
revoke execute on function public.obtener_venta(uuid)
  from service_role;
grant execute on function public.obtener_venta(uuid)
  to authenticated;

commit;
