-- Perfiles vinculados con las identidades administradas por Supabase Auth.
create table public.perfiles (
  id uuid not null,
  nombre_completo varchar(150) not null,
  telefono varchar(30),
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint perfiles_pk primary key (id),
  constraint perfiles_usuario_fk
    foreign key (id)
    references auth.users (id)
    on delete restrict
);

-- Catálogos para organizar la autorización por roles y permisos específicos.
create table public.roles (
  id uuid not null default gen_random_uuid(),
  nombre varchar(80) not null,
  descripcion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint roles_pk primary key (id),
  constraint roles_nombre_unico unique (nombre)
);

create table public.permisos (
  id uuid not null default gen_random_uuid(),
  codigo varchar(100) not null,
  nombre varchar(120) not null,
  descripcion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint permisos_pk primary key (id),
  constraint permisos_codigo_unico unique (codigo)
);

-- Tablas puente para las relaciones de muchos a muchos.
create table public.usuarios_roles (
  usuario_id uuid not null,
  rol_id uuid not null,
  fecha_asignacion timestamptz not null default now(),
  constraint usuarios_roles_pk primary key (usuario_id, rol_id),
  constraint usuarios_roles_usuario_fk
    foreign key (usuario_id)
    references public.perfiles (id)
    on delete restrict,
  constraint usuarios_roles_rol_fk
    foreign key (rol_id)
    references public.roles (id)
    on delete restrict
);

create table public.roles_permisos (
  rol_id uuid not null,
  permiso_id uuid not null,
  fecha_asignacion timestamptz not null default now(),
  constraint roles_permisos_pk primary key (rol_id, permiso_id),
  constraint roles_permisos_rol_fk
    foreign key (rol_id)
    references public.roles (id)
    on delete restrict,
  constraint roles_permisos_permiso_fk
    foreign key (permiso_id)
    references public.permisos (id)
    on delete restrict
);

-- Las PK compuestas ya indexan su primera columna; estos índices cubren las
-- consultas y validaciones de FK realizadas desde la segunda columna.
create index indice_usuarios_roles_rol_id
  on public.usuarios_roles (rol_id);

create index indice_roles_permisos_permiso_id
  on public.roles_permisos (permiso_id);

-- RLS queda habilitado sin políticas: el acceso de clientes permanecerá cerrado
-- hasta diseñar y probar reglas de autorización en una tarea posterior.
alter table public.perfiles enable row level security;
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.usuarios_roles enable row level security;
alter table public.roles_permisos enable row level security;
