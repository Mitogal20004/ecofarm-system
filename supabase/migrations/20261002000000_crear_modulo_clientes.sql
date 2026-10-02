begin;

-- Catálogo de clientes registrado independientemente de Supabase Auth. Las
-- ventas futuras podrán referenciarlo de forma opcional y conservar su propia
-- copia de los datos fiscales utilizados al emitir cada documento.
create table public.clientes (
  id uuid not null default gen_random_uuid(),
  tipo varchar(20) not null,
  nombre_completo varchar(150),
  razon_social varchar(200),
  nit varchar(30) not null,
  telefono varchar(30),
  correo_electronico varchar(254),
  direccion text not null,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint clientes_pk primary key (id),
  constraint clientes_tipo_check
    check (tipo in ('individual', 'empresa')),
  constraint clientes_nombre_segun_tipo_check
    check (
      (
        tipo = 'individual'
        and nombre_completo is not null
        and btrim(nombre_completo) <> ''
        and razon_social is null
      )
      or (
        tipo = 'empresa'
        and razon_social is not null
        and btrim(razon_social) <> ''
        and nombre_completo is null
      )
    ),
  constraint clientes_nit_no_vacio_check
    check (btrim(nit) <> ''),
  constraint clientes_nit_normalizado_check
    check (
      nit = upper(regexp_replace(btrim(nit), '[[:space:]-]+', '', 'g'))
    ),
  constraint clientes_nit_unico unique (nit),
  constraint clientes_telefono_no_vacio_check
    check (telefono is null or btrim(telefono) <> ''),
  constraint clientes_correo_formato_check
    check (
      correo_electronico is null
      or (
        correo_electronico = lower(btrim(correo_electronico))
        and correo_electronico ~
          '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  constraint clientes_direccion_check
    check (btrim(direccion) <> '' and char_length(direccion) <= 500)
);

create index indice_clientes_activo
  on public.clientes (activo);

create index indice_clientes_tipo
  on public.clientes (tipo);

alter table public.clientes enable row level security;


-- Lista clientes únicos con filtros y paginación estable.
create function public.listar_clientes(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
  p_activo boolean default null,
  p_tipo text default null
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
  v_tipo text;
  v_total bigint;
  v_clientes jsonb;
begin
  if not public.usuario_actual_tiene_permiso('cliente.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_pagina is null or p_pagina < 1 then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_limite is null or p_limite < 1 or p_limite > 100 then
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
  v_tipo := nullif(lower(btrim(p_tipo)), '');

  if char_length(v_busqueda) > 150
    or (v_tipo is not null and v_tipo not in ('individual', 'empresa'))
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.clientes as cliente
  where (p_activo is null or cliente.activo = p_activo)
    and (v_tipo is null or cliente.tipo = v_tipo)
    and (
      v_busqueda is null
      or strpos(lower(coalesce(cliente.nombre_completo, '')), lower(v_busqueda)) > 0
      or strpos(lower(coalesce(cliente.razon_social, '')), lower(v_busqueda)) > 0
      or (
        v_busqueda_nit is not null
        and strpos(cliente.nit, v_busqueda_nit) > 0
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cliente_pagina.id,
        'tipo', cliente_pagina.tipo,
        'nombre_completo', cliente_pagina.nombre_completo,
        'razon_social', cliente_pagina.razon_social,
        'nit', cliente_pagina.nit,
        'telefono', cliente_pagina.telefono,
        'correo_electronico', cliente_pagina.correo_electronico,
        'direccion', cliente_pagina.direccion,
        'activo', cliente_pagina.activo,
        'fecha_creacion', cliente_pagina.fecha_creacion,
        'fecha_actualizacion', cliente_pagina.fecha_actualizacion
      )
      order by
        lower(coalesce(
          cliente_pagina.nombre_completo,
          cliente_pagina.razon_social
        )),
        cliente_pagina.id
    ),
    '[]'::jsonb
  )
  into v_clientes
  from (
    select cliente.*
    from public.clientes as cliente
    where (p_activo is null or cliente.activo = p_activo)
      and (v_tipo is null or cliente.tipo = v_tipo)
      and (
        v_busqueda is null
        or strpos(
          lower(coalesce(cliente.nombre_completo, '')),
          lower(v_busqueda)
        ) > 0
        or strpos(
          lower(coalesce(cliente.razon_social, '')),
          lower(v_busqueda)
        ) > 0
        or (
          v_busqueda_nit is not null
          and strpos(cliente.nit, v_busqueda_nit) > 0
        )
      )
    order by
      lower(coalesce(cliente.nombre_completo, cliente.razon_social)),
      cliente.id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as cliente_pagina;

  return jsonb_build_object(
    'clientes', v_clientes,
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
  on function public.listar_clientes(integer, integer, text, boolean, text)
  from public;
revoke execute
  on function public.listar_clientes(integer, integer, text, boolean, text)
  from anon;
revoke execute
  on function public.listar_clientes(integer, integer, text, boolean, text)
  from service_role;
grant execute
  on function public.listar_clientes(integer, integer, text, boolean, text)
  to authenticated;


-- Consulta un cliente después de autorizar al solicitante.
create function public.obtener_detalle_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_cliente jsonb;
begin
  if not public.usuario_actual_tiene_permiso('cliente.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_cliente_id is null then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select jsonb_build_object(
    'id', cliente.id,
    'tipo', cliente.tipo,
    'nombre_completo', cliente.nombre_completo,
    'razon_social', cliente.razon_social,
    'nit', cliente.nit,
    'telefono', cliente.telefono,
    'correo_electronico', cliente.correo_electronico,
    'direccion', cliente.direccion,
    'activo', cliente.activo,
    'fecha_creacion', cliente.fecha_creacion,
    'fecha_actualizacion', cliente.fecha_actualizacion
  )
  into v_cliente
  from public.clientes as cliente
  where cliente.id = p_cliente_id;

  if v_cliente is null then
    raise exception using
      errcode = 'P0002',
      message = 'El cliente solicitado no existe.';
  end if;

  return jsonb_build_object('cliente', v_cliente);
end;
$funcion$;

revoke execute
  on function public.obtener_detalle_cliente(uuid)
  from public;
revoke execute
  on function public.obtener_detalle_cliente(uuid)
  from anon;
revoke execute
  on function public.obtener_detalle_cliente(uuid)
  from service_role;
grant execute
  on function public.obtener_detalle_cliente(uuid)
  to authenticated;


-- Registra un cliente y normaliza sus campos de identificación.
create function public.crear_cliente(
  p_tipo text,
  p_nombre_completo text,
  p_razon_social text,
  p_nit text,
  p_telefono text,
  p_correo_electronico text,
  p_direccion text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_tipo text;
  v_nombre_completo text;
  v_razon_social text;
  v_nit text;
  v_telefono text;
  v_correo_electronico text;
  v_direccion text;
  v_cliente public.clientes%rowtype;
begin
  if not public.usuario_actual_tiene_permiso('cliente.crear') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_tipo := lower(btrim(p_tipo));
  v_nombre_completo := nullif(
    btrim(regexp_replace(p_nombre_completo, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_razon_social := nullif(
    btrim(regexp_replace(p_razon_social, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_nit := upper(regexp_replace(btrim(p_nit), '[[:space:]-]+', '', 'g'));
  v_telefono := nullif(btrim(p_telefono), '');
  v_correo_electronico := lower(nullif(btrim(p_correo_electronico), ''));
  v_direccion := nullif(
    btrim(regexp_replace(p_direccion, '[[:space:]]+', ' ', 'g')),
    ''
  );

  if v_tipo is null
    or v_tipo not in ('individual', 'empresa')
    or v_nit is null
    or v_nit = ''
    or char_length(v_nit) > 30
    or v_direccion is null
    or char_length(v_direccion) > 500
    or char_length(v_telefono) > 30
    or char_length(v_correo_electronico) > 254
    or (
      v_correo_electronico is not null
      and v_correo_electronico !~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
    or (
      v_tipo = 'individual'
      and (
        v_nombre_completo is null
        or char_length(v_nombre_completo) > 150
        or v_razon_social is not null
      )
    )
    or (
      v_tipo = 'empresa'
      and (
        v_razon_social is null
        or char_length(v_razon_social) > 200
        or v_nombre_completo is not null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  insert into public.clientes (
    tipo,
    nombre_completo,
    razon_social,
    nit,
    telefono,
    correo_electronico,
    direccion
  )
  values (
    v_tipo,
    v_nombre_completo,
    v_razon_social,
    v_nit,
    v_telefono,
    v_correo_electronico,
    v_direccion
  )
  returning * into v_cliente;

  return jsonb_build_object(
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'tipo', v_cliente.tipo,
      'nombre_completo', v_cliente.nombre_completo,
      'razon_social', v_cliente.razon_social,
      'nit', v_cliente.nit,
      'telefono', v_cliente.telefono,
      'correo_electronico', v_cliente.correo_electronico,
      'direccion', v_cliente.direccion,
      'activo', v_cliente.activo,
      'fecha_creacion', v_cliente.fecha_creacion,
      'fecha_actualizacion', v_cliente.fecha_actualizacion
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'Los datos proporcionados ya están registrados.';
end;
$funcion$;

revoke execute
  on function public.crear_cliente(text, text, text, text, text, text, text)
  from public;
revoke execute
  on function public.crear_cliente(text, text, text, text, text, text, text)
  from anon;
revoke execute
  on function public.crear_cliente(text, text, text, text, text, text, text)
  from service_role;
grant execute
  on function public.crear_cliente(text, text, text, text, text, text, text)
  to authenticated;


-- Actualiza exclusivamente los campos administrables y conserva el historial.
create function public.actualizar_cliente(
  p_cliente_id uuid,
  p_cambios jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_cliente public.clientes%rowtype;
  v_tipo text;
  v_nombre_completo text;
  v_razon_social text;
  v_nit text;
  v_telefono text;
  v_correo_electronico text;
  v_direccion text;
  v_activo boolean;
begin
  if not public.usuario_actual_tiene_permiso('cliente.editar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_cliente_id is null
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
      'tipo',
      'nombre_completo',
      'razon_social',
      'nit',
      'telefono',
      'correo_electronico',
      'direccion',
      'activo'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if (p_cambios ? 'tipo' and jsonb_typeof(p_cambios -> 'tipo') <> 'string')
    or (
      p_cambios ? 'nombre_completo'
      and jsonb_typeof(p_cambios -> 'nombre_completo') not in ('string', 'null')
    )
    or (
      p_cambios ? 'razon_social'
      and jsonb_typeof(p_cambios -> 'razon_social') not in ('string', 'null')
    )
    or (p_cambios ? 'nit' and jsonb_typeof(p_cambios -> 'nit') <> 'string')
    or (
      p_cambios ? 'telefono'
      and jsonb_typeof(p_cambios -> 'telefono') not in ('string', 'null')
    )
    or (
      p_cambios ? 'correo_electronico'
      and jsonb_typeof(p_cambios -> 'correo_electronico')
        not in ('string', 'null')
    )
    or (
      p_cambios ? 'direccion'
      and jsonb_typeof(p_cambios -> 'direccion') <> 'string'
    )
    or (
      p_cambios ? 'activo'
      and jsonb_typeof(p_cambios -> 'activo') <> 'boolean'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select cliente.*
  into v_cliente
  from public.clientes as cliente
  where cliente.id = p_cliente_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El cliente solicitado no existe.';
  end if;

  v_tipo := v_cliente.tipo;
  v_nombre_completo := v_cliente.nombre_completo;
  v_razon_social := v_cliente.razon_social;
  v_nit := v_cliente.nit;
  v_telefono := v_cliente.telefono;
  v_correo_electronico := v_cliente.correo_electronico;
  v_direccion := v_cliente.direccion;
  v_activo := v_cliente.activo;

  if p_cambios ? 'tipo' then
    v_tipo := lower(btrim(p_cambios ->> 'tipo'));
  end if;

  if p_cambios ? 'nombre_completo' then
    v_nombre_completo := nullif(
      btrim(regexp_replace(
        p_cambios ->> 'nombre_completo',
        '[[:space:]]+',
        ' ',
        'g'
      )),
      ''
    );
  end if;

  if p_cambios ? 'razon_social' then
    v_razon_social := nullif(
      btrim(regexp_replace(
        p_cambios ->> 'razon_social',
        '[[:space:]]+',
        ' ',
        'g'
      )),
      ''
    );
  end if;

  if p_cambios ? 'nit' then
    v_nit := upper(regexp_replace(
      btrim(p_cambios ->> 'nit'),
      '[[:space:]-]+',
      '',
      'g'
    ));
  end if;

  if p_cambios ? 'telefono' then
    v_telefono := nullif(btrim(p_cambios ->> 'telefono'), '');
  end if;

  if p_cambios ? 'correo_electronico' then
    v_correo_electronico := lower(nullif(
      btrim(p_cambios ->> 'correo_electronico'),
      ''
    ));
  end if;

  if p_cambios ? 'direccion' then
    v_direccion := nullif(
      btrim(regexp_replace(
        p_cambios ->> 'direccion',
        '[[:space:]]+',
        ' ',
        'g'
      )),
      ''
    );
  end if;

  if p_cambios ? 'activo' then
    v_activo := (p_cambios ->> 'activo')::boolean;
  end if;

  if v_tipo is null
    or v_tipo not in ('individual', 'empresa')
    or v_nit is null
    or v_nit = ''
    or char_length(v_nit) > 30
    or v_direccion is null
    or char_length(v_direccion) > 500
    or char_length(v_telefono) > 30
    or char_length(v_correo_electronico) > 254
    or (
      v_correo_electronico is not null
      and v_correo_electronico !~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
    or (
      v_tipo = 'individual'
      and (
        v_nombre_completo is null
        or char_length(v_nombre_completo) > 150
        or v_razon_social is not null
      )
    )
    or (
      v_tipo = 'empresa'
      and (
        v_razon_social is null
        or char_length(v_razon_social) > 200
        or v_nombre_completo is not null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  update public.clientes as cliente
  set
    tipo = v_tipo,
    nombre_completo = v_nombre_completo,
    razon_social = v_razon_social,
    nit = v_nit,
    telefono = v_telefono,
    correo_electronico = v_correo_electronico,
    direccion = v_direccion,
    activo = v_activo,
    fecha_actualizacion = now()
  where cliente.id = p_cliente_id
  returning cliente.* into v_cliente;

  return jsonb_build_object(
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'tipo', v_cliente.tipo,
      'nombre_completo', v_cliente.nombre_completo,
      'razon_social', v_cliente.razon_social,
      'nit', v_cliente.nit,
      'telefono', v_cliente.telefono,
      'correo_electronico', v_cliente.correo_electronico,
      'direccion', v_cliente.direccion,
      'activo', v_cliente.activo,
      'fecha_creacion', v_cliente.fecha_creacion,
      'fecha_actualizacion', v_cliente.fecha_actualizacion
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'Los datos proporcionados ya están registrados.';
end;
$funcion$;

revoke execute
  on function public.actualizar_cliente(uuid, jsonb)
  from public;
revoke execute
  on function public.actualizar_cliente(uuid, jsonb)
  from anon;
revoke execute
  on function public.actualizar_cliente(uuid, jsonb)
  from service_role;
grant execute
  on function public.actualizar_cliente(uuid, jsonb)
  to authenticated;

commit;
