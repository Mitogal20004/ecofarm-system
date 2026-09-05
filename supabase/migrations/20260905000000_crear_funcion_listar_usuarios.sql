begin;

-- Lista perfiles con su correo de Auth y sus roles asignados. La autorización
-- se comprueba antes de consultar los perfiles que formarán el resultado.
create function public.listar_usuarios(
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
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', perfil_pagina.id,
        'email', perfil_pagina.email,
        'nombre_completo', perfil_pagina.nombre_completo,
        'telefono', perfil_pagina.telefono,
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

commit;
