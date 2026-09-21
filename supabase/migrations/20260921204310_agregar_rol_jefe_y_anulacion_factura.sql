begin;

-- Rol Jefe para supervisión general del negocio.
insert into public.roles (
  nombre,
  descripcion
)
values (
  'Jefe',
  'Supervisar las operaciones del negocio, consultar información general y autorizar acciones sensibles.'
)
on conflict (nombre) do update
set
  descripcion = excluded.descripcion,
  activo = true,
  fecha_actualizacion = now();


-- Permiso específico para anular documentos FEL.
insert into public.permisos (
  codigo,
  nombre,
  descripcion
)
values (
  'factura.anular',
  'Anular facturas',
  'Solicitar la anulación de una factura certificada siguiendo las reglas FEL, permisos y auditoría correspondientes.'
)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  activo = true,
  fecha_actualizacion = now();


-- Permisos del rol Jefe.
with permisos_jefe (codigo) as (
  values
    ('cliente.ver'),
    ('cliente.crear'),
    ('cliente.editar'),

    ('categoria.ver'),

    ('producto.ver'),

    ('inventario.ver'),
    ('inventario.ver_movimientos'),
    ('inventario.ajustar'),

    ('venta.ver'),
    ('venta.crear'),
    ('venta.anular'),

    ('cotizacion.ver'),
    ('cotizacion.crear'),
    ('cotizacion.editar'),
    ('cotizacion.convertir'),

    ('factura.ver'),
    ('factura.generar'),
    ('factura.anular'),

    ('reporte.ver'),

    ('usuario.ver'),
    ('usuario.administrar'),

    ('rol.ver'),

    ('auditoria.ver')
)
insert into public.roles_permisos (
  rol_id,
  permiso_id
)
select
  rol.id,
  permiso.id
from public.roles as rol
cross join permisos_jefe
join public.permisos as permiso
  on permiso.codigo = permisos_jefe.codigo
where rol.nombre = 'Jefe'
on conflict (rol_id, permiso_id) do nothing;


-- El Administrador también puede anular facturas FEL.
insert into public.roles_permisos (
  rol_id,
  permiso_id
)
select
  rol.id,
  permiso.id
from public.roles as rol
join public.permisos as permiso
  on permiso.codigo = 'factura.anular'
where rol.nombre = 'Administrador'
on conflict (rol_id, permiso_id) do nothing;

commit;