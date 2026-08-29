begin;
-- Roles iniciales definidos para ECOFARM.
insert into public.roles (nombre, descripcion)
values
  (
    'Administrador',
    'Mantener la configuración general, la seguridad y la supervisión completa del sistema.'
  ),
  (
    'Encargado de ventas',
    'Gestionar el ciclo comercial desde el cliente y la cotización hasta la venta y su documento asociado.'
  ),
  (
    'Encargado de inventario',
    'Mantener el catálogo de productos y controlar existencias y movimientos.'
  ),
  (
    'Empleado',
    'Ejecutar operaciones básicas y frecuentes con un alcance limitado.'
  );

-- Permisos iniciales documentados en la matriz aprobada.
insert into public.permisos (codigo, nombre, descripcion)
values
  (
    'cliente.ver',
    'Consultar clientes',
    'Consultar listados y detalles de clientes dentro del alcance autorizado.'
  ),
  (
    'cliente.crear',
    'Crear clientes',
    'Registrar un nuevo cliente.'
  ),
  (
    'cliente.editar',
    'Editar clientes',
    'Actualizar información o estado de un cliente sin eliminar su historial.'
  ),
  (
    'categoria.ver',
    'Consultar categorías',
    'Consultar las categorías disponibles.'
  ),
  (
    'categoria.administrar',
    'Administrar categorías',
    'Crear, editar o desactivar categorías.'
  ),
  (
    'producto.ver',
    'Consultar productos',
    'Consultar catálogo, precios visibles y datos generales.'
  ),
  (
    'producto.crear',
    'Crear productos',
    'Registrar productos en el catálogo.'
  ),
  (
    'producto.editar',
    'Editar productos',
    'Actualizar información o estado de productos; el control de precios sigue pendiente.'
  ),
  (
    'inventario.ver',
    'Consultar existencias',
    'Consultar el saldo y disponibilidad actual de productos.'
  ),
  (
    'inventario.ver_movimientos',
    'Consultar movimientos',
    'Consultar el historial de entradas, salidas y ajustes.'
  ),
  (
    'inventario.registrar_movimiento',
    'Registrar movimientos',
    'Registrar entradas o salidas manuales autorizadas; no sustituye movimientos automáticos de ventas.'
  ),
  (
    'inventario.ajustar',
    'Ajustar inventario',
    'Corregir existencias con motivo obligatorio y futura auditoría.'
  ),
  (
    'venta.ver',
    'Consultar ventas',
    'Consultar ventas e información relacionada dentro del alcance autorizado.'
  ),
  (
    'venta.crear',
    'Crear ventas',
    'Registrar y completar ventas según el flujo de confirmación futuro.'
  ),
  (
    'venta.anular',
    'Anular ventas',
    'Anular una venta siguiendo reglas de compensación y auditoría.'
  ),
  (
    'cotizacion.ver',
    'Consultar cotizaciones',
    'Consultar cotizaciones y sus estados.'
  ),
  (
    'cotizacion.crear',
    'Crear cotizaciones',
    'Registrar una nueva cotización sin afectar inventario.'
  ),
  (
    'cotizacion.editar',
    'Editar cotizaciones',
    'Modificar una cotización cuando su estado lo permita.'
  ),
  (
    'cotizacion.convertir',
    'Convertir cotizaciones',
    'Generar una venta desde una cotización válida.'
  ),
  (
    'factura.ver',
    'Consultar facturas',
    'Consultar documentos relacionados con ventas.'
  ),
  (
    'factura.generar',
    'Generar facturas',
    'Generar el documento permitido desde una venta válida.'
  ),
  (
    'reporte.ver',
    'Consultar reportes',
    'Consultar los reportes que posteriormente se autoricen.'
  ),
  (
    'usuario.ver',
    'Consultar usuarios',
    'Consultar perfiles, estado y roles asignados.'
  ),
  (
    'usuario.administrar',
    'Administrar usuarios',
    'Crear, actualizar, desactivar usuarios y gestionar asignaciones de roles mediante el flujo autorizado.'
  ),
  (
    'rol.ver',
    'Consultar roles y permisos',
    'Consultar roles, permisos disponibles y sus relaciones.'
  ),
  (
    'rol.administrar',
    'Administrar roles y permisos',
    'Crear o actualizar roles y gestionar sus asignaciones de permisos.'
  ),
  (
    'auditoria.ver',
    'Consultar auditoría',
    'Consultar acciones sensibles y sus datos permitidos.'
  );

-- Asignaciones entre roles y permisos según la matriz aprobada.
with asignaciones (rol_nombre, permiso_codigo) as (
  values
    ('Administrador', 'cliente.ver'),
    ('Administrador', 'cliente.crear'),
    ('Administrador', 'cliente.editar'),
    ('Administrador', 'categoria.ver'),
    ('Administrador', 'categoria.administrar'),
    ('Administrador', 'producto.ver'),
    ('Administrador', 'producto.crear'),
    ('Administrador', 'producto.editar'),
    ('Administrador', 'inventario.ver'),
    ('Administrador', 'inventario.ver_movimientos'),
    ('Administrador', 'inventario.registrar_movimiento'),
    ('Administrador', 'inventario.ajustar'),
    ('Administrador', 'venta.ver'),
    ('Administrador', 'venta.crear'),
    ('Administrador', 'venta.anular'),
    ('Administrador', 'cotizacion.ver'),
    ('Administrador', 'cotizacion.crear'),
    ('Administrador', 'cotizacion.editar'),
    ('Administrador', 'cotizacion.convertir'),
    ('Administrador', 'factura.ver'),
    ('Administrador', 'factura.generar'),
    ('Administrador', 'reporte.ver'),
    ('Administrador', 'usuario.ver'),
    ('Administrador', 'usuario.administrar'),
    ('Administrador', 'rol.ver'),
    ('Administrador', 'rol.administrar'),
    ('Administrador', 'auditoria.ver'),
    ('Encargado de ventas', 'cliente.ver'),
    ('Encargado de ventas', 'cliente.crear'),
    ('Encargado de ventas', 'cliente.editar'),
    ('Encargado de ventas', 'categoria.ver'),
    ('Encargado de ventas', 'producto.ver'),
    ('Encargado de ventas', 'inventario.ver'),
    ('Encargado de ventas', 'venta.ver'),
    ('Encargado de ventas', 'venta.crear'),
    ('Encargado de ventas', 'cotizacion.ver'),
    ('Encargado de ventas', 'cotizacion.crear'),
    ('Encargado de ventas', 'cotizacion.editar'),
    ('Encargado de ventas', 'cotizacion.convertir'),
    ('Encargado de ventas', 'factura.ver'),
    ('Encargado de ventas', 'factura.generar'),
    ('Encargado de inventario', 'categoria.ver'),
    ('Encargado de inventario', 'categoria.administrar'),
    ('Encargado de inventario', 'producto.ver'),
    ('Encargado de inventario', 'producto.crear'),
    ('Encargado de inventario', 'producto.editar'),
    ('Encargado de inventario', 'inventario.ver'),
    ('Encargado de inventario', 'inventario.ver_movimientos'),
    ('Encargado de inventario', 'inventario.registrar_movimiento'),
    ('Encargado de inventario', 'inventario.ajustar'),
    ('Empleado', 'cliente.ver'),
    ('Empleado', 'cliente.crear'),
    ('Empleado', 'categoria.ver'),
    ('Empleado', 'producto.ver'),
    ('Empleado', 'inventario.ver'),
    ('Empleado', 'venta.ver'),
    ('Empleado', 'venta.crear')
)
insert into public.roles_permisos (rol_id, permiso_id)
select
  roles.id,
  permisos.id
from asignaciones
join public.roles
  on roles.nombre = asignaciones.rol_nombre
join public.permisos
  on permisos.codigo = asignaciones.permiso_codigo;

commit;
