begin;

-- Catálogo de proveedores e insumos. Los insumos no se mezclan con las
-- variantes comerciales de flores para conservar costos y unidades distintas.
create table public.proveedores (
  id uuid not null default gen_random_uuid(),
  nombre varchar(200) not null,
  nit varchar(30),
  contacto varchar(150),
  telefono varchar(30),
  correo varchar(254),
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint proveedores_pk primary key (id),
  constraint proveedores_nombre_check check (btrim(nombre) <> ''),
  constraint proveedores_correo_check check (correo is null or correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index proveedores_nit_unico
  on public.proveedores (upper(btrim(nit)))
  where nit is not null and btrim(nit) <> '';

create table public.insumos (
  id uuid not null default gen_random_uuid(),
  codigo varchar(40) not null,
  nombre varchar(150) not null,
  categoria varchar(50) not null,
  unidad_medida varchar(20) not null,
  costo_referencia numeric(14,4) not null default 0,
  stock_minimo numeric(14,4) not null default 0,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint insumos_pk primary key (id),
  constraint insumos_codigo_unico unique (codigo),
  constraint insumos_codigo_check check (codigo = upper(btrim(codigo)) and codigo ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  constraint insumos_nombre_check check (btrim(nombre) <> ''),
  constraint insumos_costo_check check (costo_referencia >= 0 and stock_minimo >= 0)
);

-- Un lote es la unidad de trazabilidad de entrada, producción, calidad,
-- empaque, reserva, despacho y costo FIFO.
create table public.lotes (
  id uuid not null default gen_random_uuid(),
  codigo varchar(50) not null,
  origen varchar(20) not null,
  proveedor_id uuid,
  variante_id uuid,
  fecha_origen date not null,
  fecha_recepcion date,
  fecha_vencimiento date,
  variedad varchar(120) not null,
  color varchar(80) not null,
  longitud_cm integer not null,
  calidad varchar(30),
  cantidad_inicial integer not null,
  cantidad_disponible integer not null,
  costo_unitario numeric(14,4) not null default 0,
  estado varchar(20) not null default 'cuarentena',
  observaciones varchar(1000),
  creado_por uuid not null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint lotes_pk primary key (id),
  constraint lotes_codigo_unico unique (codigo),
  constraint lotes_origen_check check (origen in ('compra', 'produccion')),
  constraint lotes_proveedor_check check ((origen = 'compra' and proveedor_id is not null) or (origen = 'produccion' and proveedor_id is null)),
  constraint lotes_cantidad_check check (cantidad_inicial > 0 and cantidad_disponible between 0 and cantidad_inicial),
  constraint lotes_costo_check check (costo_unitario >= 0),
  constraint lotes_estado_check check (estado in ('cuarentena', 'liberado', 'rechazado', 'agotado')),
  constraint lotes_longitud_check check (longitud_cm > 0),
  constraint lotes_fechas_check check (fecha_recepcion is null or fecha_recepcion >= fecha_origen),
  constraint lotes_proveedor_fk foreign key (proveedor_id) references public.proveedores (id) on delete restrict,
  constraint lotes_variante_fk foreign key (variante_id) references public.producto_variantes (id) on delete restrict,
  constraint lotes_creado_por_fk foreign key (creado_por) references public.perfiles (id) on delete restrict
);

create index lotes_estado_fecha_idx on public.lotes (estado, fecha_origen, id);
create index lotes_variante_fifo_idx on public.lotes (variante_id, fecha_origen, id) where estado = 'liberado' and cantidad_disponible > 0;

create table public.inspecciones_calidad (
  id uuid not null default gen_random_uuid(),
  lote_id uuid not null,
  resultado varchar(20) not null,
  observaciones varchar(2000),
  evidencia_url text,
  inspeccionado_por uuid not null,
  fecha_inspeccion timestamptz not null default now(),
  constraint inspecciones_calidad_pk primary key (id),
  constraint inspecciones_calidad_resultado_check check (resultado in ('aprobado', 'observado', 'rechazado')),
  constraint inspecciones_calidad_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict,
  constraint inspecciones_calidad_usuario_fk foreign key (inspeccionado_por) references public.perfiles (id) on delete restrict
);

create table public.movimientos_lotes (
  id uuid not null default gen_random_uuid(),
  lote_id uuid not null,
  tipo varchar(30) not null,
  cantidad integer not null,
  saldo_anterior integer not null,
  saldo_posterior integer not null,
  referencia_tipo varchar(30),
  referencia_id uuid,
  motivo varchar(500),
  usuario_id uuid not null,
  fecha_movimiento timestamptz not null default now(),
  constraint movimientos_lotes_pk primary key (id),
  constraint movimientos_lotes_tipo_check check (tipo in ('entrada', 'salida', 'reserva', 'liberacion', 'merma', 'empaque', 'despacho', 'ajuste')),
  constraint movimientos_lotes_cantidad_check check (cantidad > 0 and saldo_anterior >= 0 and saldo_posterior >= 0),
  constraint movimientos_lotes_saldo_check check (tipo in ('entrada', 'liberacion') and saldo_posterior = saldo_anterior + cantidad or tipo in ('salida', 'reserva', 'merma', 'empaque', 'despacho') and saldo_posterior = saldo_anterior - cantidad or tipo = 'ajuste'),
  constraint movimientos_lotes_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict,
  constraint movimientos_lotes_usuario_fk foreign key (usuario_id) references public.perfiles (id) on delete restrict
);

create index movimientos_lotes_lote_fecha_idx on public.movimientos_lotes (lote_id, fecha_movimiento, id);

create table public.mermas (
  id uuid not null default gen_random_uuid(),
  lote_id uuid,
  insumo_id uuid,
  etapa varchar(30) not null,
  motivo varchar(100) not null,
  cantidad numeric(14,4) not null,
  costo_unitario numeric(14,4) not null default 0,
  observaciones varchar(1000),
  registrado_por uuid not null,
  fecha_merma timestamptz not null default now(),
  constraint mermas_pk primary key (id),
  constraint mermas_origen_check check ((lote_id is not null) <> (insumo_id is not null)),
  constraint mermas_etapa_check check (etapa in ('recepcion', 'clasificacion', 'empaque', 'almacenamiento', 'despacho', 'produccion')),
  constraint mermas_cantidad_check check (cantidad > 0 and costo_unitario >= 0),
  constraint mermas_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict,
  constraint mermas_insumo_fk foreign key (insumo_id) references public.insumos (id) on delete restrict,
  constraint mermas_usuario_fk foreign key (registrado_por) references public.perfiles (id) on delete restrict
);

create table public.compras (
  id uuid not null default gen_random_uuid(),
  numero varchar(40) not null,
  proveedor_id uuid not null,
  estado varchar(20) not null default 'borrador',
  fecha_compra date not null default current_date,
  total numeric(14,2) not null default 0,
  observaciones varchar(1000),
  creado_por uuid not null,
  fecha_creacion timestamptz not null default now(),
  constraint compras_pk primary key (id),
  constraint compras_numero_unico unique (numero),
  constraint compras_estado_check check (estado in ('borrador', 'ordenada', 'recibida', 'cancelada')),
  constraint compras_total_check check (total >= 0),
  constraint compras_proveedor_fk foreign key (proveedor_id) references public.proveedores (id) on delete restrict,
  constraint compras_usuario_fk foreign key (creado_por) references public.perfiles (id) on delete restrict
);

create table public.pedidos (
  id uuid not null default gen_random_uuid(),
  numero varchar(40) not null,
  cliente_id uuid not null,
  cotizacion_id uuid,
  estado varchar(25) not null default 'pendiente',
  fecha_entrega_estimada date,
  direccion_entrega text,
  observaciones varchar(1000),
  creado_por uuid not null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint pedidos_pk primary key (id),
  constraint pedidos_numero_unico unique (numero),
  constraint pedidos_estado_check check (estado in ('pendiente', 'reservado', 'en_preparacion', 'despachado', 'entregado', 'cancelado')),
  constraint pedidos_cliente_fk foreign key (cliente_id) references public.clientes (id) on delete restrict,
  constraint pedidos_cotizacion_fk foreign key (cotizacion_id) references public.cotizaciones (id) on delete restrict,
  constraint pedidos_usuario_fk foreign key (creado_por) references public.perfiles (id) on delete restrict
);

create table public.despachos (
  id uuid not null default gen_random_uuid(),
  pedido_id uuid not null,
  estado varchar(20) not null default 'preparando',
  transportista varchar(150),
  fecha_despacho timestamptz,
  fecha_entrega timestamptz,
  evidencia_url text,
  entregado_por uuid,
  observaciones varchar(1000),
  creado_por uuid not null,
  fecha_creacion timestamptz not null default now(),
  constraint despachos_pk primary key (id),
  constraint despachos_estado_check check (estado in ('preparando', 'enviado', 'entregado', 'devuelto', 'cancelado')),
  constraint despachos_pedido_fk foreign key (pedido_id) references public.pedidos (id) on delete restrict,
  constraint despachos_entregado_por_fk foreign key (entregado_por) references public.perfiles (id) on delete restrict,
  constraint despachos_creado_por_fk foreign key (creado_por) references public.perfiles (id) on delete restrict
);

create table public.compra_detalles (
  id uuid not null default gen_random_uuid(),
  compra_id uuid not null,
  insumo_id uuid,
  variante_id uuid,
  descripcion varchar(200) not null,
  cantidad numeric(14,4) not null,
  costo_unitario numeric(14,4) not null,
  subtotal numeric(14,2) generated always as (round(cantidad * costo_unitario, 2)) stored,
  constraint compra_detalles_pk primary key (id),
  constraint compra_detalles_origen_check check ((insumo_id is not null) <> (variante_id is not null)),
  constraint compra_detalles_cantidad_check check (cantidad > 0 and costo_unitario >= 0),
  constraint compra_detalles_compra_fk foreign key (compra_id) references public.compras (id) on delete restrict,
  constraint compra_detalles_insumo_fk foreign key (insumo_id) references public.insumos (id) on delete restrict,
  constraint compra_detalles_variante_fk foreign key (variante_id) references public.producto_variantes (id) on delete restrict
);

create table public.pedido_detalles (
  id uuid not null default gen_random_uuid(),
  pedido_id uuid not null,
  variante_id uuid,
  lote_id uuid,
  descripcion varchar(200) not null,
  cantidad integer not null,
  precio_unitario numeric(14,2) not null default 0,
  constraint pedido_detalles_pk primary key (id),
  constraint pedido_detalles_cantidad_check check (cantidad > 0 and precio_unitario >= 0),
  constraint pedido_detalles_pedido_fk foreign key (pedido_id) references public.pedidos (id) on delete restrict,
  constraint pedido_detalles_variante_fk foreign key (variante_id) references public.producto_variantes (id) on delete restrict,
  constraint pedido_detalles_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict
);

create table public.reservas_pedido (
  id uuid not null default gen_random_uuid(),
  pedido_detalle_id uuid not null,
  lote_id uuid not null,
  cantidad integer not null,
  estado varchar(20) not null default 'activa',
  fecha_reserva timestamptz not null default now(),
  fecha_liberacion timestamptz,
  constraint reservas_pedido_pk primary key (id),
  constraint reservas_pedido_cantidad_check check (cantidad > 0),
  constraint reservas_pedido_estado_check check (estado in ('activa', 'consumida', 'liberada')),
  constraint reservas_pedido_detalle_fk foreign key (pedido_detalle_id) references public.pedido_detalles (id) on delete restrict,
  constraint reservas_pedido_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict
);

create table public.ordenes_empaque (
  id uuid not null default gen_random_uuid(),
  numero varchar(40) not null,
  pedido_id uuid,
  estado varchar(20) not null default 'pendiente',
  cantidad_paquetes integer not null default 0,
  observaciones varchar(1000),
  creado_por uuid not null,
  fecha_creacion timestamptz not null default now(),
  fecha_finalizacion timestamptz,
  constraint ordenes_empaque_pk primary key (id),
  constraint ordenes_empaque_numero_unico unique (numero),
  constraint ordenes_empaque_estado_check check (estado in ('pendiente', 'en_proceso', 'completada', 'cancelada')),
  constraint ordenes_empaque_cantidad_check check (cantidad_paquetes >= 0),
  constraint ordenes_empaque_pedido_fk foreign key (pedido_id) references public.pedidos (id) on delete restrict,
  constraint ordenes_empaque_usuario_fk foreign key (creado_por) references public.perfiles (id) on delete restrict
);

create table public.ordenes_empaque_detalles (
  id uuid not null default gen_random_uuid(),
  orden_empaque_id uuid not null,
  lote_id uuid not null,
  insumo_id uuid,
  cantidad_flores integer not null default 0,
  cantidad_insumo numeric(14,4) not null default 0,
  presentacion_id uuid,
  constraint ordenes_empaque_detalles_pk primary key (id),
  constraint ordenes_empaque_detalles_cantidad_check check (cantidad_flores > 0 or cantidad_insumo > 0),
  constraint ordenes_empaque_detalles_orden_fk foreign key (orden_empaque_id) references public.ordenes_empaque (id) on delete restrict,
  constraint ordenes_empaque_detalles_lote_fk foreign key (lote_id) references public.lotes (id) on delete restrict,
  constraint ordenes_empaque_detalles_insumo_fk foreign key (insumo_id) references public.insumos (id) on delete restrict,
  constraint ordenes_empaque_detalles_presentacion_fk foreign key (presentacion_id) references public.presentaciones_producto (id) on delete restrict
);

-- El hash evita que una filtración de la base permita consultar QR públicos.
create table public.qr_lotes (
  id uuid not null default gen_random_uuid(),
  lote_id uuid not null,
  token_hash varchar(128) not null,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  constraint qr_lotes_pk primary key (id),
  constraint qr_lotes_lote_unico unique (lote_id),
  constraint qr_lotes_token_unico unique (token_hash),
  constraint qr_lotes_lote_fk foreign key (lote_id) references public.lotes (id) on delete cascade
);

create table public.auditoria_eventos (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid,
  accion varchar(100) not null,
  entidad varchar(100) not null,
  entidad_id uuid,
  datos jsonb not null default '{}'::jsonb,
  fecha_evento timestamptz not null default now(),
  constraint auditoria_eventos_pk primary key (id),
  constraint auditoria_eventos_datos_check check (jsonb_typeof(datos) = 'object'),
  constraint auditoria_eventos_usuario_fk foreign key (usuario_id) references public.perfiles (id) on delete set null
);

create index pedidos_estado_fecha_idx on public.pedidos (estado, fecha_creacion desc);
create index despachos_estado_fecha_idx on public.despachos (estado, fecha_creacion desc);
create index mermas_fecha_idx on public.mermas (fecha_merma desc, etapa);
create index auditoria_eventos_entidad_idx on public.auditoria_eventos (entidad, entidad_id, fecha_evento desc);

-- Los nuevos módulos se consumirán mediante RPC autorizadas, igual que los
-- módulos existentes. No se permite acceso directo desde el navegador.
do $rls$
declare
  tabla text;
begin
  foreach tabla in array array[
    'proveedores', 'insumos', 'lotes', 'inspecciones_calidad',
    'movimientos_lotes', 'mermas', 'compras', 'compra_detalles', 'pedidos',
    'pedido_detalles', 'reservas_pedido', 'despachos', 'ordenes_empaque',
    'ordenes_empaque_detalles', 'qr_lotes', 'auditoria_eventos'
  ] loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('revoke all on table public.%I from public, anon, authenticated', tabla);
  end loop;
end;
$rls$;

insert into public.permisos (codigo, nombre, descripcion)
values
  ('lote.ver', 'Consultar lotes', 'Consultar lotes y su trazabilidad.'),
  ('lote.administrar', 'Administrar lotes', 'Crear y actualizar lotes.'),
  ('insumo.ver', 'Consultar insumos', 'Consultar catálogo y existencias de insumos.'),
  ('insumo.administrar', 'Administrar insumos', 'Crear y actualizar insumos.'),
  ('calidad.ver', 'Consultar calidad', 'Consultar inspecciones y estados de calidad.'),
  ('calidad.registrar', 'Registrar calidad', 'Aprobar, observar o rechazar lotes.'),
  ('merma.ver', 'Consultar mermas', 'Consultar pérdidas y desperdicios.'),
  ('merma.registrar', 'Registrar mermas', 'Registrar pérdidas y desperdicios.'),
  ('compra.ver', 'Consultar compras', 'Consultar compras y recepciones.'),
  ('compra.administrar', 'Administrar compras', 'Crear y gestionar compras.'),
  ('pedido.ver', 'Consultar pedidos', 'Consultar pedidos y estados.'),
  ('pedido.administrar', 'Administrar pedidos', 'Crear y gestionar pedidos.'),
  ('despacho.ver', 'Consultar despachos', 'Consultar preparación y entregas.'),
  ('despacho.administrar', 'Administrar despachos', 'Preparar y entregar pedidos.'),
  ('costo.ver', 'Consultar costos', 'Consultar costos y rentabilidad.'),
  ('auditoria.ver', 'Consultar auditoría', 'Consultar eventos de auditoría.')
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, activo = true, fecha_actualizacion = now();

insert into public.roles_permisos (rol_id, permiso_id)
select rol.id, permiso.id
from public.roles rol
cross join public.permisos permiso
where rol.nombre in ('Administrador', 'Jefe')
  and permiso.codigo in (
    'lote.ver', 'lote.administrar', 'insumo.ver', 'insumo.administrar',
    'calidad.ver', 'calidad.registrar', 'merma.ver', 'merma.registrar',
    'compra.ver', 'compra.administrar', 'pedido.ver', 'pedido.administrar',
    'despacho.ver', 'despacho.administrar', 'costo.ver', 'auditoria.ver'
  )
on conflict (rol_id, permiso_id) do nothing;

commit;
