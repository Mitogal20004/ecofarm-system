begin;

-- La validación usa la misma normalización del índice definitivo. Si existen
-- conflictos, la migración se detiene sin modificar ni reasignar perfiles.
do $validacion$
begin
  if exists (
    select 1
    from public.perfiles as perfil
    where perfil.serie_documentos is not null
    group by upper(btrim(perfil.serie_documentos))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Existen series de documentos duplicadas. Corrija los datos antes de aplicar la restricción.';
  end if;

  if exists (
    select 1
    from public.perfiles as perfil
    where perfil.serie_documentos is not null
      and (
        perfil.serie_documentos <> upper(btrim(perfil.serie_documentos))
        or perfil.serie_documentos !~ '^[A-Z0-9]{1,8}$'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existen series de documentos con formato inválido. Corrija los datos antes de aplicar la restricción.';
  end if;
end;
$validacion$;

drop index if exists public.perfiles_serie_documentos_unica;

create unique index perfiles_serie_documentos_unica
  on public.perfiles (upper(btrim(serie_documentos)))
  where serie_documentos is not null;

commit;
