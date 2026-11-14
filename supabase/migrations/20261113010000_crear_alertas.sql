begin;

create table public.alertas (
  id uuid not null default gen_random_uuid(),
  tipo varchar(80) not null,
  severidad varchar(20) not null default 'warning',
  titulo varchar(200) not null,
  mensaje text not null,
  contexto jsonb not null default '{}'::jsonb,
  clave_deduplicacion varchar(255),
  estado varchar(20) not null default 'abierta',
  fecha_creacion timestamptz not null default now(),
  fecha_resolucion timestamptz,
  constraint alertas_pk primary key (id),
  constraint alertas_severidad_check
    check (severidad in ('info', 'warning', 'critical')),
  constraint alertas_estado_check
    check (estado in ('abierta', 'resuelta')), 
  constraint alertas_titulo_check
    check (btrim(titulo) <> '' and char_length(titulo) <= 200),
  constraint alertas_mensaje_check
    check (btrim(mensaje) <> '' and char_length(mensaje) <= 5000),
  constraint alertas_contexto_check
    check (jsonb_typeof(contexto) = 'object'),
  constraint alertas_resolucion_check
    check (
      (estado = 'abierta' and fecha_resolucion is null)
      or (estado = 'resuelta' and fecha_resolucion is not null)
    )
);

create index alertas_estado_fecha_idx
  on public.alertas (estado, fecha_creacion desc);

create index alertas_tipo_fecha_idx
  on public.alertas (tipo, fecha_creacion desc);

alter table public.alertas enable row level security;
revoke all on table public.alertas from public, anon, authenticated;

commit;
