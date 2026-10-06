begin;

do $validacion$
begin
  if not exists (
    select 1
    from public.roles as rol
    where rol.nombre = 'Jefe'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'El rol Jefe no existe.';
  end if;

  if not exists (
    select 1
    from public.permisos as permiso
    where permiso.codigo = 'inventario.registrar_movimiento'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'El permiso inventario.registrar_movimiento no existe.';
  end if;
end;
$validacion$;

insert into public.roles_permisos (
  rol_id,
  permiso_id
)
select
  rol.id,
  permiso.id
from public.roles as rol
cross join public.permisos as permiso
where rol.nombre = 'Jefe'
  and permiso.codigo = 'inventario.registrar_movimiento'
on conflict (rol_id, permiso_id) do nothing;

commit;
