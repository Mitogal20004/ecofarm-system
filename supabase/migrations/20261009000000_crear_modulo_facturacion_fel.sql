begin;

-- La Factura FEL tiene identidad fiscal propia. Los números internos de Venta
-- y Recibo se conservan únicamente como referencias comerciales de E-farm.
create table public.facturas_fel (
  id uuid not null default gen_random_uuid(),
  venta_id uuid not null,
  estado varchar(20) not null default 'pendiente',
  tipo_documento varchar(10) not null default 'FACT',
  nit_receptor_snapshot varchar(30) not null,
  nombre_receptor_snapshot varchar(200) not null,
  direccion_receptor_snapshot text,
  total_snapshot numeric(14, 2) not null,
  xml_solicitud text,
  uuid_fel uuid,
  serie_fel varchar(100),
  numero_fel varchar(100),
  fecha_certificacion timestamptz,
  xml_certificado text,
  pdf_storage_path varchar(1000),
  respuesta_certificador jsonb,
  mensaje_error varchar(1000),
  cantidad_intentos integer not null default 0,
  token_procesamiento uuid,
  fecha_inicio_procesamiento timestamptz,
  usuario_solicitante uuid not null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint facturas_fel_pk primary key (id),
  constraint facturas_fel_venta_unica unique (venta_id),
  constraint facturas_fel_venta_fk
    foreign key (venta_id)
    references public.ventas (id)
    on delete restrict,
  constraint facturas_fel_usuario_solicitante_fk
    foreign key (usuario_solicitante)
    references public.perfiles (id)
    on delete restrict,
  constraint facturas_fel_estado_check
    check (
      estado in (
        'pendiente',
        'procesando',
        'certificada',
        'error',
        'anulada'
      )
    ),
  constraint facturas_fel_tipo_documento_check
    check (tipo_documento = 'FACT'),
  constraint facturas_fel_nit_receptor_check
    check (
      btrim(nit_receptor_snapshot) <> ''
      and nit_receptor_snapshot = upper(
        regexp_replace(
          btrim(nit_receptor_snapshot),
          '[[:space:]-]+',
          '',
          'g'
        )
      )
    ),
  constraint facturas_fel_nombre_receptor_check
    check (btrim(nombre_receptor_snapshot) <> ''),
  constraint facturas_fel_direccion_receptor_check
    check (
      direccion_receptor_snapshot is null
      or (
        btrim(direccion_receptor_snapshot) <> ''
        and char_length(direccion_receptor_snapshot) <= 500
      )
    ),
  constraint facturas_fel_total_check
    check (total_snapshot >= 0),
  constraint facturas_fel_xml_solicitud_check
    check (
      xml_solicitud is null
      or btrim(xml_solicitud) <> ''
    ),
  constraint facturas_fel_serie_check
    check (
      serie_fel is null
      or (
        serie_fel = btrim(serie_fel)
        and serie_fel <> ''
      )
    ),
  constraint facturas_fel_numero_check
    check (
      numero_fel is null
      or (
        numero_fel = btrim(numero_fel)
        and numero_fel <> ''
      )
    ),
  constraint facturas_fel_xml_certificado_check
    check (
      xml_certificado is null
      or btrim(xml_certificado) <> ''
    ),
  constraint facturas_fel_pdf_path_check
    check (
      pdf_storage_path is null
      or (
        pdf_storage_path = btrim(pdf_storage_path)
        and pdf_storage_path <> ''
      )
    ),
  constraint facturas_fel_respuesta_check
    check (
      respuesta_certificador is null
      or jsonb_typeof(respuesta_certificador) = 'object'
    ),
  constraint facturas_fel_intentos_check
    check (cantidad_intentos >= 0),
  constraint facturas_fel_fechas_check
    check (fecha_actualizacion >= fecha_creacion),
  constraint facturas_fel_estado_datos_check
    check (
      (
        estado = 'pendiente'
        and uuid_fel is null
        and serie_fel is null
        and numero_fel is null
        and fecha_certificacion is null
        and xml_certificado is null
        and pdf_storage_path is null
        and respuesta_certificador is null
        and mensaje_error is null
        and cantidad_intentos = 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
      )
      or (
        estado = 'procesando'
        and xml_solicitud is not null
        and uuid_fel is null
        and serie_fel is null
        and numero_fel is null
        and fecha_certificacion is null
        and xml_certificado is null
        and pdf_storage_path is null
        and respuesta_certificador is null
        and mensaje_error is null
        and cantidad_intentos > 0
        and token_procesamiento is not null
        and fecha_inicio_procesamiento is not null
      )
      or (
        estado = 'error'
        and xml_solicitud is not null
        and uuid_fel is null
        and serie_fel is null
        and numero_fel is null
        and fecha_certificacion is null
        and xml_certificado is null
        and pdf_storage_path is null
        and mensaje_error is not null
        and btrim(mensaje_error) <> ''
        and cantidad_intentos > 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
      )
      or (
        estado in ('certificada', 'anulada')
        and xml_solicitud is not null
        and uuid_fel is not null
        and serie_fel is not null
        and numero_fel is not null
        and fecha_certificacion is not null
        and xml_certificado is not null
        and mensaje_error is null
        and cantidad_intentos > 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
      )
    )
);

-- Los CHECK validan la forma de cada estado; este trigger protege además la
-- dirección del flujo y vuelve inmutable la identidad fiscal certificada.
create function public.validar_transicion_factura_fel()
returns trigger
language plpgsql
set search_path = ''
as $funcion$
begin
  if (
    old.estado = 'pendiente'
    and new.estado not in ('pendiente', 'procesando')
  ) or (
    old.estado = 'procesando'
    and new.estado not in ('procesando', 'certificada', 'error')
  ) or (
    old.estado = 'error'
    and new.estado not in ('error', 'procesando')
  ) or (
    old.estado = 'certificada'
    and new.estado not in ('certificada', 'anulada')
  ) or (
    old.estado = 'anulada'
    and new.estado <> 'anulada'
  ) then
    raise exception using
      errcode = '23514',
      message = 'La transición de estado de la factura FEL no es válida.';
  end if;

  if old.estado in ('certificada', 'anulada')
    and row(
      new.id,
      new.venta_id,
      new.tipo_documento,
      new.nit_receptor_snapshot,
      new.nombre_receptor_snapshot,
      new.direccion_receptor_snapshot,
      new.total_snapshot,
      new.xml_solicitud,
      new.uuid_fel,
      new.serie_fel,
      new.numero_fel,
      new.fecha_certificacion,
      new.xml_certificado,
      new.respuesta_certificador,
      new.cantidad_intentos,
      new.usuario_solicitante,
      new.fecha_creacion
    ) is distinct from row(
      old.id,
      old.venta_id,
      old.tipo_documento,
      old.nit_receptor_snapshot,
      old.nombre_receptor_snapshot,
      old.direccion_receptor_snapshot,
      old.total_snapshot,
      old.xml_solicitud,
      old.uuid_fel,
      old.serie_fel,
      old.numero_fel,
      old.fecha_certificacion,
      old.xml_certificado,
      old.respuesta_certificador,
      old.cantidad_intentos,
      old.usuario_solicitante,
      old.fecha_creacion
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Los datos fiscales certificados no pueden modificarse.';
  end if;

  return new;
end;
$funcion$;

revoke execute
  on function public.validar_transicion_factura_fel()
  from public;
revoke execute
  on function public.validar_transicion_factura_fel()
  from anon;
revoke execute
  on function public.validar_transicion_factura_fel()
  from authenticated;
revoke execute
  on function public.validar_transicion_factura_fel()
  from service_role;

create trigger validar_transicion_factura_fel_antes_update
before update on public.facturas_fel
for each row
execute function public.validar_transicion_factura_fel();

create unique index facturas_fel_uuid_unico
  on public.facturas_fel (uuid_fel)
  where uuid_fel is not null;
create unique index facturas_fel_serie_numero_unicos
  on public.facturas_fel (
    upper(btrim(serie_fel)),
    btrim(numero_fel)
  )
  where serie_fel is not null
    and numero_fel is not null;
create index indice_facturas_fel_estado_fecha
  on public.facturas_fel (estado, fecha_creacion desc, id desc);
create index indice_facturas_fel_usuario_fecha
  on public.facturas_fel (
    usuario_solicitante,
    fecha_creacion desc,
    id desc
  );


-- La anulación fiscal es distinta de la anulación comercial de una Venta.
-- Su solicitud y respuesta se conservan en un flujo independiente.
create table public.anulaciones_facturas_fel (
  id uuid not null default gen_random_uuid(),
  factura_fel_id uuid not null,
  estado varchar(20) not null default 'pendiente',
  motivo varchar(500) not null,
  xml_solicitud text,
  respuesta_certificador jsonb,
  mensaje_error varchar(1000),
  cantidad_intentos integer not null default 0,
  token_procesamiento uuid,
  fecha_inicio_procesamiento timestamptz,
  fecha_anulacion timestamptz,
  usuario_solicitante uuid not null,
  fecha_solicitud timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint anulaciones_facturas_fel_pk primary key (id),
  constraint anulaciones_facturas_fel_factura_unica
    unique (factura_fel_id),
  constraint anulaciones_facturas_fel_factura_fk
    foreign key (factura_fel_id)
    references public.facturas_fel (id)
    on delete restrict,
  constraint anulaciones_facturas_fel_usuario_fk
    foreign key (usuario_solicitante)
    references public.perfiles (id)
    on delete restrict,
  constraint anulaciones_facturas_fel_estado_check
    check (estado in ('pendiente', 'procesando', 'error', 'completada')),
  constraint anulaciones_facturas_fel_motivo_check
    check (btrim(motivo) <> ''),
  constraint anulaciones_facturas_fel_xml_check
    check (
      xml_solicitud is null
      or btrim(xml_solicitud) <> ''
    ),
  constraint anulaciones_facturas_fel_respuesta_check
    check (
      respuesta_certificador is null
      or jsonb_typeof(respuesta_certificador) = 'object'
    ),
  constraint anulaciones_facturas_fel_intentos_check
    check (cantidad_intentos >= 0),
  constraint anulaciones_facturas_fel_fechas_check
    check (fecha_actualizacion >= fecha_solicitud),
  constraint anulaciones_facturas_fel_estado_datos_check
    check (
      (
        estado = 'pendiente'
        and respuesta_certificador is null
        and mensaje_error is null
        and cantidad_intentos = 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
        and fecha_anulacion is null
      )
      or (
        estado = 'procesando'
        and xml_solicitud is not null
        and respuesta_certificador is null
        and mensaje_error is null
        and cantidad_intentos > 0
        and token_procesamiento is not null
        and fecha_inicio_procesamiento is not null
        and fecha_anulacion is null
      )
      or (
        estado = 'error'
        and xml_solicitud is not null
        and mensaje_error is not null
        and btrim(mensaje_error) <> ''
        and cantidad_intentos > 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
        and fecha_anulacion is null
      )
      or (
        estado = 'completada'
        and xml_solicitud is not null
        and respuesta_certificador is not null
        and mensaje_error is null
        and cantidad_intentos > 0
        and token_procesamiento is null
        and fecha_inicio_procesamiento is null
        and fecha_anulacion is not null
      )
    )
);

create function public.validar_transicion_anulacion_factura_fel()
returns trigger
language plpgsql
set search_path = ''
as $funcion$
begin
  if (
    old.estado = 'pendiente'
    and new.estado not in ('pendiente', 'procesando')
  ) or (
    old.estado = 'procesando'
    and new.estado not in ('procesando', 'error', 'completada')
  ) or (
    old.estado = 'error'
    and new.estado not in ('error', 'procesando')
  ) or (
    old.estado = 'completada'
    and new.estado <> 'completada'
  ) then
    raise exception using
      errcode = '23514',
      message = 'La transición de estado de la anulación FEL no es válida.';
  end if;

  if old.estado = 'completada'
    and row(
      new.id,
      new.factura_fel_id,
      new.motivo,
      new.xml_solicitud,
      new.respuesta_certificador,
      new.cantidad_intentos,
      new.fecha_anulacion,
      new.usuario_solicitante,
      new.fecha_solicitud
    ) is distinct from row(
      old.id,
      old.factura_fel_id,
      old.motivo,
      old.xml_solicitud,
      old.respuesta_certificador,
      old.cantidad_intentos,
      old.fecha_anulacion,
      old.usuario_solicitante,
      old.fecha_solicitud
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Los datos de la anulación FEL no pueden modificarse.';
  end if;

  return new;
end;
$funcion$;

revoke execute
  on function public.validar_transicion_anulacion_factura_fel()
  from public;
revoke execute
  on function public.validar_transicion_anulacion_factura_fel()
  from anon;
revoke execute
  on function public.validar_transicion_anulacion_factura_fel()
  from authenticated;
revoke execute
  on function public.validar_transicion_anulacion_factura_fel()
  from service_role;

create trigger validar_transicion_anulacion_factura_fel_antes_update
before update on public.anulaciones_facturas_fel
for each row
execute function public.validar_transicion_anulacion_factura_fel();

create index indice_anulaciones_facturas_fel_estado_fecha
  on public.anulaciones_facturas_fel (
    estado,
    fecha_solicitud,
    id
  );

alter table public.facturas_fel enable row level security;
alter table public.anulaciones_facturas_fel enable row level security;


-- La migración depende de los permisos ya existentes y falla de forma clara
-- si se ejecuta sobre una base con un historial incompleto.
do $validacion$
begin
  if not exists (
    select 1
    from public.permisos as permiso
    where permiso.codigo = 'factura.ver'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'El permiso factura.ver no existe.';
  end if;

  if not exists (
    select 1
    from public.permisos as permiso
    where permiso.codigo = 'factura.generar'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'El permiso factura.generar no existe.';
  end if;

  if not exists (
    select 1
    from public.permisos as permiso
    where permiso.codigo = 'factura.anular'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'El permiso factura.anular no existe.';
  end if;
end;
$validacion$;


-- Registra de forma idempotente la intención fiscal a partir de una Venta.
-- Los productos, importes y datos del receptor nunca se reciben del frontend.
create function public.solicitar_factura_fel(p_venta_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_usuario_id uuid;
  v_venta public.ventas%rowtype;
  v_factura public.facturas_fel%rowtype;
  v_creada boolean;
begin
  if not public.usuario_actual_tiene_permiso('factura.generar') then
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

  select venta.*
  into v_venta
  from public.ventas as venta
  where venta.id = p_venta_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La venta solicitada no existe.';
  end if;

  select factura.*
  into v_factura
  from public.facturas_fel as factura
  where factura.venta_id = p_venta_id;

  if found then
    return jsonb_build_object(
      'cambio', false,
      'factura', jsonb_build_object(
        'id', v_factura.id,
        'venta_id', v_factura.venta_id,
        'numero_venta', v_venta.numero,
        'estado', v_factura.estado,
        'tipo_documento', v_factura.tipo_documento,
        'uuid_fel', v_factura.uuid_fel,
        'serie_fel', v_factura.serie_fel,
        'numero_fel', v_factura.numero_fel,
        'fecha_certificacion', v_factura.fecha_certificacion,
        'fecha_creacion', v_factura.fecha_creacion
      )
    );
  end if;

  if v_venta.estado <> 'confirmada' then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  insert into public.facturas_fel (
    venta_id,
    nit_receptor_snapshot,
    nombre_receptor_snapshot,
    direccion_receptor_snapshot,
    total_snapshot,
    usuario_solicitante
  )
  values (
    v_venta.id,
    v_venta.comprador_nit,
    v_venta.comprador_nombre,
    v_venta.comprador_direccion,
    v_venta.total,
    v_usuario_id
  )
  on conflict (venta_id) do nothing
  returning * into v_factura;

  v_creada := found;

  if not v_creada then
    select factura.*
    into strict v_factura
    from public.facturas_fel as factura
    where factura.venta_id = p_venta_id;
  end if;

  return jsonb_build_object(
    'cambio', v_creada,
    'factura', jsonb_build_object(
      'id', v_factura.id,
      'venta_id', v_factura.venta_id,
      'numero_venta', v_venta.numero,
      'estado', v_factura.estado,
      'tipo_documento', v_factura.tipo_documento,
      'uuid_fel', v_factura.uuid_fel,
      'serie_fel', v_factura.serie_fel,
      'numero_fel', v_factura.numero_fel,
      'fecha_certificacion', v_factura.fecha_certificacion,
      'fecha_creacion', v_factura.fecha_creacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.solicitar_factura_fel(uuid)
  from public;
revoke execute
  on function public.solicitar_factura_fel(uuid)
  from anon;
revoke execute
  on function public.solicitar_factura_fel(uuid)
  from service_role;
grant execute
  on function public.solicitar_factura_fel(uuid)
  to authenticated;


-- Registra la intención de anulación sin alterar la Venta ni declarar la
-- Factura anulada antes de recibir la confirmación futura del certificador.
create function public.solicitar_anulacion_factura_fel(
  p_factura_id uuid,
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
  v_factura public.facturas_fel%rowtype;
  v_anulacion public.anulaciones_facturas_fel%rowtype;
  v_creada boolean;
begin
  if not public.usuario_actual_tiene_permiso('factura.anular') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_motivo := nullif(
    btrim(regexp_replace(p_motivo, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if p_factura_id is null
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

  select factura.*
  into v_factura
  from public.facturas_fel as factura
  where factura.id = p_factura_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La factura solicitada no existe.';
  end if;

  select anulacion.*
  into v_anulacion
  from public.anulaciones_facturas_fel as anulacion
  where anulacion.factura_fel_id = p_factura_id;

  if found then
    return jsonb_build_object(
      'cambio', false,
      'anulacion', jsonb_build_object(
        'id', v_anulacion.id,
        'factura_fel_id', v_anulacion.factura_fel_id,
        'estado', v_anulacion.estado,
        'motivo', v_anulacion.motivo,
        'mensaje_error', v_anulacion.mensaje_error,
        'cantidad_intentos', v_anulacion.cantidad_intentos,
        'fecha_solicitud', v_anulacion.fecha_solicitud,
        'fecha_anulacion', v_anulacion.fecha_anulacion
      )
    );
  end if;

  if v_factura.estado <> 'certificada' then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  insert into public.anulaciones_facturas_fel (
    factura_fel_id,
    motivo,
    usuario_solicitante
  )
  values (
    p_factura_id,
    v_motivo,
    v_usuario_id
  )
  on conflict (factura_fel_id) do nothing
  returning * into v_anulacion;

  v_creada := found;

  if not v_creada then
    select anulacion.*
    into strict v_anulacion
    from public.anulaciones_facturas_fel as anulacion
    where anulacion.factura_fel_id = p_factura_id;
  end if;

  return jsonb_build_object(
    'cambio', v_creada,
    'anulacion', jsonb_build_object(
      'id', v_anulacion.id,
      'factura_fel_id', v_anulacion.factura_fel_id,
      'estado', v_anulacion.estado,
      'motivo', v_anulacion.motivo,
      'mensaje_error', v_anulacion.mensaje_error,
      'cantidad_intentos', v_anulacion.cantidad_intentos,
      'fecha_solicitud', v_anulacion.fecha_solicitud,
      'fecha_anulacion', v_anulacion.fecha_anulacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.solicitar_anulacion_factura_fel(uuid, text)
  from public;
revoke execute
  on function public.solicitar_anulacion_factura_fel(uuid, text)
  from anon;
revoke execute
  on function public.solicitar_anulacion_factura_fel(uuid, text)
  from service_role;
grant execute
  on function public.solicitar_anulacion_factura_fel(uuid, text)
  to authenticated;


create function public.listar_facturas_fel(
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
  v_estado text;
  v_total bigint;
  v_facturas jsonb;
begin
  if not public.usuario_actual_tiene_permiso('factura.ver') then
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
  v_estado := nullif(lower(btrim(p_estado)), '');

  if char_length(v_busqueda) > 150
    or (
      v_estado is not null
      and v_estado not in (
        'pendiente',
        'procesando',
        'certificada',
        'error',
        'anulada'
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.facturas_fel as factura
  join public.ventas as venta
    on venta.id = factura.venta_id
  where (v_estado is null or factura.estado = v_estado)
    and (
      p_fecha_desde is null
      or factura.fecha_creacion >= (
        p_fecha_desde::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      p_fecha_hasta is null
      or factura.fecha_creacion < (
        (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
      )
    )
    and (
      v_busqueda is null
      or strpos(lower(venta.numero), lower(v_busqueda)) > 0
      or strpos(
        lower(factura.nombre_receptor_snapshot),
        lower(v_busqueda)
      ) > 0
      or strpos(
        lower(factura.nit_receptor_snapshot),
        lower(v_busqueda)
      ) > 0
      or strpos(
        lower(coalesce(factura.uuid_fel::text, '')),
        lower(v_busqueda)
      ) > 0
      or strpos(
        lower(
          coalesce(factura.serie_fel, '')
          || '-'
          || coalesce(factura.numero_fel, '')
        ),
        lower(v_busqueda)
      ) > 0
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pagina.id,
        'venta', jsonb_build_object(
          'id', pagina.venta_id,
          'numero', pagina.numero_venta,
          'estado', pagina.estado_venta,
          'fecha_confirmacion', pagina.fecha_confirmacion
        ),
        'estado', pagina.estado,
        'tipo_documento', pagina.tipo_documento,
        'receptor', jsonb_build_object(
          'nit', pagina.nit_receptor_snapshot,
          'nombre', pagina.nombre_receptor_snapshot,
          'direccion', pagina.direccion_receptor_snapshot
        ),
        'total', pagina.total_snapshot,
        'uuid_fel', pagina.uuid_fel,
        'serie_fel', pagina.serie_fel,
        'numero_fel', pagina.numero_fel,
        'fecha_certificacion', pagina.fecha_certificacion,
        'mensaje_error', pagina.mensaje_error,
        'cantidad_intentos', pagina.cantidad_intentos,
        'usuario_solicitante', jsonb_build_object(
          'id', pagina.usuario_solicitante,
          'nombre_completo', pagina.nombre_usuario
        ),
        'fecha_creacion', pagina.fecha_creacion,
        'fecha_actualizacion', pagina.fecha_actualizacion
      )
      order by pagina.fecha_creacion desc, pagina.id desc
    ),
    '[]'::jsonb
  )
  into v_facturas
  from (
    select
      factura.*,
      venta.numero as numero_venta,
      venta.estado as estado_venta,
      venta.fecha_confirmacion,
      perfil.nombre_completo as nombre_usuario
    from public.facturas_fel as factura
    join public.ventas as venta
      on venta.id = factura.venta_id
    join public.perfiles as perfil
      on perfil.id = factura.usuario_solicitante
    where (v_estado is null or factura.estado = v_estado)
      and (
        p_fecha_desde is null
        or factura.fecha_creacion >= (
          p_fecha_desde::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        p_fecha_hasta is null
        or factura.fecha_creacion < (
          (p_fecha_hasta + 1)::timestamp at time zone 'America/Guatemala'
        )
      )
      and (
        v_busqueda is null
        or strpos(lower(venta.numero), lower(v_busqueda)) > 0
        or strpos(
          lower(factura.nombre_receptor_snapshot),
          lower(v_busqueda)
        ) > 0
        or strpos(
          lower(factura.nit_receptor_snapshot),
          lower(v_busqueda)
        ) > 0
        or strpos(
          lower(coalesce(factura.uuid_fel::text, '')),
          lower(v_busqueda)
        ) > 0
        or strpos(
          lower(
            coalesce(factura.serie_fel, '')
            || '-'
            || coalesce(factura.numero_fel, '')
          ),
          lower(v_busqueda)
        ) > 0
      )
    order by factura.fecha_creacion desc, factura.id desc
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as pagina;

  return jsonb_build_object(
    'facturas', v_facturas,
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
  on function public.listar_facturas_fel(
    integer,
    integer,
    text,
    text,
    date,
    date
  )
  from public;
revoke execute
  on function public.listar_facturas_fel(
    integer,
    integer,
    text,
    text,
    date,
    date
  )
  from anon;
revoke execute
  on function public.listar_facturas_fel(
    integer,
    integer,
    text,
    text,
    date,
    date
  )
  from service_role;
grant execute
  on function public.listar_facturas_fel(
    integer,
    integer,
    text,
    text,
    date,
    date
  )
  to authenticated;


create function public.obtener_factura_fel(p_factura_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_factura jsonb;
begin
  if not public.usuario_actual_tiene_permiso('factura.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_factura_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select jsonb_build_object(
    'id', factura.id,
    'venta', jsonb_build_object(
      'id', venta.id,
      'numero', venta.numero,
      'origen', venta.origen,
      'estado', venta.estado,
      'fecha_confirmacion', venta.fecha_confirmacion
    ),
    'estado', factura.estado,
    'tipo_documento', factura.tipo_documento,
    'receptor', jsonb_build_object(
      'nit', factura.nit_receptor_snapshot,
      'nombre', factura.nombre_receptor_snapshot,
      'direccion', factura.direccion_receptor_snapshot
    ),
    'total', factura.total_snapshot,
    'uuid_fel', factura.uuid_fel,
    'serie_fel', factura.serie_fel,
    'numero_fel', factura.numero_fel,
    'fecha_certificacion', factura.fecha_certificacion,
    'xml_certificado', factura.xml_certificado,
    'pdf_disponible', factura.pdf_storage_path is not null,
    'mensaje_error', factura.mensaje_error,
    'cantidad_intentos', factura.cantidad_intentos,
    'usuario_solicitante', jsonb_build_object(
      'id', perfil.id,
      'nombre_completo', perfil.nombre_completo
    ),
    'anulacion', case
      when anulacion.id is null then null
      else jsonb_build_object(
        'id', anulacion.id,
        'estado', anulacion.estado,
        'motivo', anulacion.motivo,
        'mensaje_error', anulacion.mensaje_error,
        'cantidad_intentos', anulacion.cantidad_intentos,
        'fecha_solicitud', anulacion.fecha_solicitud,
        'fecha_anulacion', anulacion.fecha_anulacion
      )
    end,
    'fecha_creacion', factura.fecha_creacion,
    'fecha_actualizacion', factura.fecha_actualizacion
  )
  into v_factura
  from public.facturas_fel as factura
  join public.ventas as venta
    on venta.id = factura.venta_id
  join public.perfiles as perfil
    on perfil.id = factura.usuario_solicitante
  left join public.anulaciones_facturas_fel as anulacion
    on anulacion.factura_fel_id = factura.id
  where factura.id = p_factura_id;

  if v_factura is null then
    raise exception using
      errcode = 'P0002',
      message = 'La factura solicitada no existe.';
  end if;

  return v_factura;
end;
$funcion$;

revoke execute
  on function public.obtener_factura_fel(uuid)
  from public;
revoke execute
  on function public.obtener_factura_fel(uuid)
  from anon;
revoke execute
  on function public.obtener_factura_fel(uuid)
  from service_role;
grant execute
  on function public.obtener_factura_fel(uuid)
  to authenticated;

commit;
