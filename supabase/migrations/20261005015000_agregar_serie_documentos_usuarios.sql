begin;

-- Serie interna operativa de E-farm para identificar al usuario que origina
-- documentos comerciales. No representa una serie, autorización ni número FEL.
alter table public.perfiles
  add column if not exists serie_documentos varchar(8);

do $validacion$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as restriccion
    where restriccion.conrelid = 'public.perfiles'::regclass
      and restriccion.conname = 'perfiles_serie_documentos_formato'
  ) then
    alter table public.perfiles
      add constraint perfiles_serie_documentos_formato
      check (
        serie_documentos is null
        or (
          char_length(serie_documentos) between 1 and 8
          and serie_documentos = upper(btrim(serie_documentos))
          and serie_documentos ~ '^[A-Z0-9]+$'
        )
      );
  end if;
end;
$validacion$;

-- La serie permanece ocupada incluso cuando el perfil está inactivo.
create unique index if not exists perfiles_serie_documentos_unica
  on public.perfiles (serie_documentos)
  where serie_documentos is not null;


-- La firma se amplía con un último parámetro opcional. Se elimina la versión
-- anterior para evitar dos variantes públicas de la misma operación.
drop function if exists public.crear_perfil_usuario(
  uuid,
  text,
  text,
  text,
  uuid
);
drop function if exists public.crear_perfil_usuario(
  uuid,
  text,
  text,
  text,
  uuid,
  text
);

create function public.crear_perfil_usuario(
  p_usuario_id uuid,
  p_nombre_completo text,
  p_nombre_usuario text,
  p_telefono text,
  p_rol_id uuid,
  p_serie_documentos text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_nombre_completo text;
  v_nombre_usuario text;
  v_telefono text;
  v_serie_documentos text;
  v_perfil public.perfiles%rowtype;
  v_rol public.roles%rowtype;
  v_puede_administrar_roles boolean;
  v_restriccion text;
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_puede_administrar_roles :=
    public.usuario_actual_tiene_permiso('rol.administrar');

  if p_usuario_id is null
    or p_nombre_completo is null
    or p_nombre_usuario is null
    or p_rol_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_nombre_completo := btrim(p_nombre_completo);
  v_nombre_usuario := lower(btrim(p_nombre_usuario));
  v_telefono := nullif(btrim(p_telefono), '');
  v_serie_documentos := nullif(upper(btrim(p_serie_documentos)), '');

  if v_nombre_completo = ''
    or char_length(v_nombre_completo) > 150
    or char_length(v_nombre_usuario) < 3
    or char_length(v_nombre_usuario) > 50
    or v_nombre_usuario !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    or char_length(v_telefono) > 30
    or char_length(v_serie_documentos) > 8
    or (
      v_serie_documentos is not null
      and v_serie_documentos !~ '^[A-Z0-9]+$'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if not exists (
    select 1
    from auth.users as usuario_auth
    where usuario_auth.id = p_usuario_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select rol.*
  into v_rol
  from public.roles as rol
  where rol.id = p_rol_id
    and rol.activo is true
  for share;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if v_rol.nombre = 'Administrador' and not v_puede_administrar_roles then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  insert into public.perfiles (
    id,
    nombre_completo,
    nombre_usuario,
    telefono,
    serie_documentos,
    activo
  )
  values (
    p_usuario_id,
    v_nombre_completo,
    v_nombre_usuario,
    v_telefono,
    v_serie_documentos,
    true
  )
  returning * into v_perfil;

  insert into public.usuarios_roles (
    usuario_id,
    rol_id
  )
  values (
    v_perfil.id,
    v_rol.id
  );

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v_perfil.id,
      'nombre_completo', v_perfil.nombre_completo,
      'nombre_usuario', v_perfil.nombre_usuario,
      'telefono', v_perfil.telefono,
      'serie_documentos', v_perfil.serie_documentos,
      'activo', v_perfil.activo
    ),
    'rol', jsonb_build_object(
      'id', v_rol.id,
      'nombre', v_rol.nombre,
      'descripcion', v_rol.descripcion,
      'activo', v_rol.activo
    )
  );
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'perfiles_serie_documentos_unica' then
      raise exception using
        errcode = '23505',
        message = 'La serie de documentos ya está asignada a otro usuario.';
    end if;

    raise;
end;
$funcion$;

revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid, text)
  from public;
revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid, text)
  from anon;
revoke execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid, text)
  from service_role;
grant execute
  on function public.crear_perfil_usuario(uuid, text, text, text, uuid, text)
  to authenticated;


-- Mantiene todas las protecciones administrativas vigentes y agrega la serie
-- como único campo nuevo editable del perfil.
create or replace function public.actualizar_perfil_usuario(
  p_usuario_id uuid,
  p_cambios jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_perfil public.perfiles%rowtype;
  v_nombre_completo text;
  v_telefono text;
  v_serie_documentos text;
  v_activo boolean;
  v_rol_administrador_id uuid;
  v_puede_administrar_roles boolean;
  v_restriccion text;
begin
  if not public.usuario_actual_tiene_permiso('usuario.administrar') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_puede_administrar_roles :=
    public.usuario_actual_tiene_permiso('rol.administrar');

  if p_usuario_id is null
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
      'nombre_completo',
      'telefono',
      'serie_documentos',
      'activo'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'nombre_completo'
    and jsonb_typeof(p_cambios -> 'nombre_completo') <> 'string'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'telefono'
    and jsonb_typeof(p_cambios -> 'telefono') not in ('string', 'null')
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'serie_documentos'
    and jsonb_typeof(p_cambios -> 'serie_documentos') not in (
      'string',
      'null'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if p_cambios ? 'activo'
    and jsonb_typeof(p_cambios -> 'activo') <> 'boolean'
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select perfil.*
  into v_perfil
  from public.perfiles as perfil
  where perfil.id = p_usuario_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El usuario solicitado no existe.';
  end if;

  v_nombre_completo := v_perfil.nombre_completo;
  v_telefono := v_perfil.telefono;
  v_serie_documentos := v_perfil.serie_documentos;
  v_activo := v_perfil.activo;

  if p_cambios ? 'nombre_completo' then
    v_nombre_completo := btrim(p_cambios ->> 'nombre_completo');

    if v_nombre_completo = '' or char_length(v_nombre_completo) > 150 then
      raise exception using
        errcode = '22023',
        message = 'Los parámetros proporcionados no son válidos.';
    end if;
  end if;

  if p_cambios ? 'telefono' then
    if jsonb_typeof(p_cambios -> 'telefono') = 'null' then
      v_telefono := null;
    else
      v_telefono := p_cambios ->> 'telefono';

      if char_length(v_telefono) > 30 then
        raise exception using
          errcode = '22023',
          message = 'Los parámetros proporcionados no son válidos.';
      end if;
    end if;
  end if;

  if p_cambios ? 'serie_documentos' then
    if jsonb_typeof(p_cambios -> 'serie_documentos') = 'null' then
      v_serie_documentos := null;
    else
      v_serie_documentos := nullif(
        upper(btrim(p_cambios ->> 'serie_documentos')),
        ''
      );

      if char_length(v_serie_documentos) > 8
        or (
          v_serie_documentos is not null
          and v_serie_documentos !~ '^[A-Z0-9]+$'
        )
      then
        raise exception using
          errcode = '22023',
          message = 'Los parámetros proporcionados no son válidos.';
      end if;
    end if;
  end if;

  if p_cambios ? 'activo' then
    v_activo := (p_cambios ->> 'activo')::boolean;
  end if;

  -- Mantiene el mismo mutex compartido con reemplazar_roles_usuario para
  -- serializar las decisiones que afectan al último Administrador activo.
  select rol.id
  into v_rol_administrador_id
  from public.roles as rol
  where rol.nombre = 'Administrador'
  for update;

  if v_rol_administrador_id is not null
    and exists (
      select 1
      from public.usuarios_roles as usuario_rol
      where usuario_rol.usuario_id = p_usuario_id
        and usuario_rol.rol_id = v_rol_administrador_id
    )
    and not v_puede_administrar_roles
  then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  -- El bloqueo previo del perfil serializa esta comprobación con cualquier
  -- reemplazo de roles realizado mediante la RPC administrativa.
  if v_activo
    and not exists (
      select 1
      from public.usuarios_roles as usuario_rol
      join public.roles as rol
        on rol.id = usuario_rol.rol_id
      where usuario_rol.usuario_id = p_usuario_id
        and rol.activo is true
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  if v_perfil.activo and not v_activo
    and v_rol_administrador_id is not null
    and exists (
      select 1
      from public.usuarios_roles as usuario_rol
      where usuario_rol.usuario_id = p_usuario_id
        and usuario_rol.rol_id = v_rol_administrador_id
    )
    and not exists (
      select 1
      from public.perfiles as otro_perfil
      join public.usuarios_roles as otro_usuario_rol
        on otro_usuario_rol.usuario_id = otro_perfil.id
      join public.roles as otro_rol
        on otro_rol.id = otro_usuario_rol.rol_id
      where otro_perfil.id <> p_usuario_id
        and otro_perfil.activo is true
        and otro_rol.id = v_rol_administrador_id
        and otro_rol.activo is true
    )
  then
    raise exception using
      errcode = '23514',
      message = 'La operación solicitada no puede realizarse.';
  end if;

  update public.perfiles as perfil
  set
    nombre_completo = v_nombre_completo,
    telefono = v_telefono,
    serie_documentos = v_serie_documentos,
    activo = v_activo,
    fecha_actualizacion = now()
  where perfil.id = p_usuario_id
  returning perfil.* into v_perfil;

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v_perfil.id,
      'nombre_completo', v_perfil.nombre_completo,
      'telefono', v_perfil.telefono,
      'serie_documentos', v_perfil.serie_documentos,
      'activo', v_perfil.activo,
      'fecha_creacion', v_perfil.fecha_creacion,
      'fecha_actualizacion', v_perfil.fecha_actualizacion
    )
  );
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;

    if v_restriccion = 'perfiles_serie_documentos_unica' then
      raise exception using
        errcode = '23505',
        message = 'La serie de documentos ya está asignada a otro usuario.';
    end if;

    raise;
end;
$funcion$;

revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from public;
revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from anon;
revoke execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  from service_role;
grant execute
  on function public.actualizar_perfil_usuario(uuid, jsonb)
  to authenticated;


create or replace function public.listar_usuarios(
  p_pagina integer default 1,
  p_limite integer default 20,
  p_busqueda text default null,
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
  v_total bigint;
  v_usuarios jsonb;
begin
  if not public.usuario_actual_tiene_permiso('usuario.ver') then
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

  if char_length(v_busqueda) > 150 then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  select count(*)
  into v_total
  from public.perfiles as perfil
  join auth.users as usuario
    on usuario.id = perfil.id
  where (p_activo is null or perfil.activo = p_activo)
    and (
      v_busqueda is null
      or strpos(lower(perfil.nombre_completo), lower(v_busqueda)) > 0
      or strpos(lower(usuario.email), lower(v_busqueda)) > 0
      or strpos(
        lower(coalesce(perfil.serie_documentos, '')),
        lower(v_busqueda)
      ) > 0
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', perfil_pagina.id,
        'email', perfil_pagina.email,
        'nombre_completo', perfil_pagina.nombre_completo,
        'telefono', perfil_pagina.telefono,
        'serie_documentos', perfil_pagina.serie_documentos,
        'activo', perfil_pagina.activo,
        'fecha_creacion', perfil_pagina.fecha_creacion,
        'fecha_actualizacion', perfil_pagina.fecha_actualizacion,
        'roles', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', rol.id,
                'nombre', rol.nombre,
                'activo', rol.activo
              )
              order by rol.nombre, rol.id
            )
            from public.usuarios_roles as usuario_rol
            join public.roles as rol
              on rol.id = usuario_rol.rol_id
            where usuario_rol.usuario_id = perfil_pagina.id
          ),
          '[]'::jsonb
        )
      )
      order by perfil_pagina.nombre_completo, perfil_pagina.id
    ),
    '[]'::jsonb
  )
  into v_usuarios
  from (
    select
      perfil.id,
      usuario.email,
      perfil.nombre_completo,
      perfil.telefono,
      perfil.serie_documentos,
      perfil.activo,
      perfil.fecha_creacion,
      perfil.fecha_actualizacion
    from public.perfiles as perfil
    join auth.users as usuario
      on usuario.id = perfil.id
    where (p_activo is null or perfil.activo = p_activo)
      and (
        v_busqueda is null
        or strpos(lower(perfil.nombre_completo), lower(v_busqueda)) > 0
        or strpos(lower(usuario.email), lower(v_busqueda)) > 0
        or strpos(
          lower(coalesce(perfil.serie_documentos, '')),
          lower(v_busqueda)
        ) > 0
      )
    order by perfil.nombre_completo, perfil.id
    limit p_limite
    offset (p_pagina - 1)::bigint * p_limite::bigint
  ) as perfil_pagina;

  return jsonb_build_object(
    'usuarios', v_usuarios,
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
  on function public.listar_usuarios(integer, integer, text, boolean)
  from public;
revoke execute
  on function public.listar_usuarios(integer, integer, text, boolean)
  from anon;
revoke execute
  on function public.listar_usuarios(integer, integer, text, boolean)
  from service_role;
grant execute
  on function public.listar_usuarios(integer, integer, text, boolean)
  to authenticated;


create or replace function public.obtener_detalle_usuario(
  p_usuario_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
begin
  if not public.usuario_actual_tiene_permiso('usuario.ver') then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  select jsonb_build_object(
    'usuario', jsonb_build_object(
      'id', perfil.id,
      'email', usuario.email,
      'nombre_completo', perfil.nombre_completo,
      'telefono', perfil.telefono,
      'serie_documentos', perfil.serie_documentos,
      'activo', perfil.activo,
      'fecha_creacion', perfil.fecha_creacion,
      'fecha_actualizacion', perfil.fecha_actualizacion
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rol.id,
            'nombre', rol.nombre,
            'descripcion', rol.descripcion,
            'activo', rol.activo,
            'fecha_asignacion', usuario_rol.fecha_asignacion
          )
          order by rol.nombre, rol.id
        )
        from public.usuarios_roles as usuario_rol
        join public.roles as rol
          on rol.id = usuario_rol.rol_id
        where usuario_rol.usuario_id = perfil.id
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from public.perfiles as perfil
  join auth.users as usuario
    on usuario.id = perfil.id
  where perfil.id = p_usuario_id;

  if v_resultado is null then
    raise exception using
      errcode = 'P0002',
      message = 'El usuario solicitado no existe.';
  end if;

  return v_resultado;
end;
$funcion$;

revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from public;
revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from anon;
revoke execute
  on function public.obtener_detalle_usuario(uuid)
  from service_role;
grant execute
  on function public.obtener_detalle_usuario(uuid)
  to authenticated;

commit;
