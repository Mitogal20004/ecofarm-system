-- Agrega un nombre de usuario único para el acceso interno a E-farm.
-- Inicialmente permite NULL para no afectar los perfiles existentes.
alter table public.perfiles
  add column nombre_usuario varchar(50);

alter table public.perfiles
  add constraint perfiles_nombre_usuario_formato
  check (
    nombre_usuario is null
    or (
      char_length(nombre_usuario) between 3 and 50
      and nombre_usuario = lower(btrim(nombre_usuario))
      and nombre_usuario ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    )
  );

create unique index perfiles_nombre_usuario_unico
  on public.perfiles (nombre_usuario)
  where nombre_usuario is not null;
