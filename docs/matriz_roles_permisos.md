# Matriz inicial de roles y permisos de ECOFARM S.A.

Este documento propone una primera distribución de responsabilidades para el sistema web de gestión/POS de ECOFARM S.A. La matriz es conceptual: no inserta datos, no configura autenticación y no sustituye las futuras reglas del backend o de Row Level Security (RLS).

## 1. Objetivo

Definir un catálogo inicial de permisos y asignarlo de forma comprensible a los cuatro roles previstos. Esta base permitirá implementar posteriormente la autorización sin depender únicamente del nombre del rol ni de la visibilidad de opciones en la interfaz.

La matriz debe revisarse con ECOFARM antes de convertirse en datos iniciales o reglas ejecutables.

## 2. Principio de mínimo privilegio

Cada usuario debe recibir únicamente los permisos necesarios para cumplir sus funciones. Tener acceso a un módulo no implica poder modificarlo, y poder crear información no implica poder anularla o administrar su seguridad.

La propuesta utiliza estas reglas:

- los permisos conceden acciones; no se diseñan permisos de denegación;
- si un usuario tiene varios roles, sus permisos efectivos serán inicialmente la unión de los permisos de esos roles;
- las acciones sensibles se mantienen separadas de las operaciones habituales;
- ante requisitos todavía desconocidos se elige la alternativa más restrictiva;
- no se crean permisos para eliminar registros importantes;
- la desactivación, cambio de estado o anulación debe preservar el historial;
- la autorización debe comprobarse aunque un botón o una opción no aparezca en la interfaz.

La posibilidad de ver un módulo tampoco define todavía qué registros puede consultar un usuario. Por ejemplo, `venta.ver` no determina si un empleado podrá consultar todas las ventas o únicamente las propias; ese alcance deberá implementarse posteriormente en backend y RLS.

## 3. Roles iniciales

### 3.1 Administrador

**Propósito:** mantener la configuración general, la seguridad y la supervisión completa del sistema.

**Responsabilidades generales:**

- administrar usuarios, roles y asignaciones de permisos;
- supervisar los módulos operativos;
- consultar auditoría;
- ejecutar acciones sensibles cuando exista una justificación empresarial;
- conservar los controles de autorización aunque tenga acceso amplio.

El Administrador no omite validaciones del backend, reglas de negocio ni RLS. Su acceso amplio debe seguir siendo trazable.

### 3.2 Encargado de ventas

**Propósito:** gestionar el ciclo comercial desde el cliente y la cotización hasta la venta y su documento asociado.

**Responsabilidades generales:**

- consultar, registrar y actualizar clientes;
- consultar productos y existencias disponibles;
- crear y consultar ventas;
- crear, editar y convertir cotizaciones;
- consultar y generar documentos de facturación según el alcance que se defina.

No administra usuarios, roles, permisos ni inventario. La anulación de ventas no se concede inicialmente hasta confirmar la política de ECOFARM.

### 3.3 Encargado de inventario

**Propósito:** mantener el catálogo de productos y controlar existencias y movimientos.

**Responsabilidades generales:**

- gestionar categorías y productos;
- consultar existencias e historial de movimientos;
- registrar entradas o salidas manuales autorizadas;
- realizar ajustes justificados;
- atender alertas de stock mínimo.

No administra usuarios ni realiza operaciones comerciales ajenas a inventario.

### 3.4 Empleado

**Propósito:** ejecutar operaciones básicas y frecuentes con un alcance limitado.

**Responsabilidades generales:**

- consultar productos y stock disponible;
- consultar y registrar clientes;
- crear y consultar ventas según el alcance que se defina para sus propios registros.

No puede modificar inventario, ajustar existencias, anular ventas, administrar usuarios ni cambiar roles. La creación de cotizaciones queda pendiente de aprobación empresarial.

## 4. Catálogo inicial de permisos

Los códigos están en español, minúsculas, sin tildes ni `ñ`, y siguen el formato `modulo.accion`.

| Código | Nombre | Descripción breve | Módulo | Tipo de acción |
| --- | --- | --- | --- | --- |
| `cliente.ver` | Consultar clientes | Consultar listados y detalles de clientes dentro del alcance autorizado | Clientes | Visualizar |
| `cliente.crear` | Crear clientes | Registrar un nuevo cliente | Clientes | Crear |
| `cliente.editar` | Editar clientes | Actualizar información o estado de un cliente sin eliminar su historial | Clientes | Modificar |
| `categoria.ver` | Consultar categorías | Consultar las categorías disponibles | Productos | Visualizar |
| `categoria.administrar` | Administrar categorías | Crear, editar o desactivar categorías | Productos | Modificar |
| `producto.ver` | Consultar productos | Consultar catálogo, precios visibles y datos generales | Productos | Visualizar |
| `producto.crear` | Crear productos | Registrar productos en el catálogo | Productos | Crear |
| `producto.editar` | Editar productos | Actualizar información o estado de productos; el control de precios sigue pendiente | Productos | Modificar |
| `inventario.ver` | Consultar existencias | Consultar el saldo y disponibilidad actual de productos | Inventario | Visualizar |
| `inventario.ver_movimientos` | Consultar movimientos | Consultar el historial de entradas, salidas y ajustes | Inventario | Visualizar |
| `inventario.registrar_movimiento` | Registrar movimientos | Registrar entradas o salidas manuales autorizadas; no sustituye movimientos automáticos de ventas | Inventario | Crear/operar |
| `inventario.ajustar` | Ajustar inventario | Corregir existencias con motivo obligatorio y futura auditoría | Inventario | Sensible |
| `venta.ver` | Consultar ventas | Consultar ventas e información relacionada dentro del alcance autorizado | Ventas | Visualizar |
| `venta.crear` | Crear ventas | Registrar y completar ventas según el flujo de confirmación futuro | Ventas | Crear/operar |
| `venta.anular` | Anular ventas | Anular una venta siguiendo reglas de compensación y auditoría | Ventas | Sensible |
| `cotizacion.ver` | Consultar cotizaciones | Consultar cotizaciones y sus estados | Cotizaciones | Visualizar |
| `cotizacion.crear` | Crear cotizaciones | Registrar una nueva cotización sin afectar inventario | Cotizaciones | Crear |
| `cotizacion.editar` | Editar cotizaciones | Modificar una cotización cuando su estado lo permita | Cotizaciones | Modificar |
| `cotizacion.convertir` | Convertir cotizaciones | Generar una venta desde una cotización válida | Cotizaciones | Sensible |
| `factura.ver` | Consultar facturas | Consultar documentos relacionados con ventas | Facturación | Visualizar |
| `factura.generar` | Generar facturas | Generar el documento permitido desde una venta válida | Facturación | Sensible |
| `reporte.ver` | Consultar reportes | Consultar los reportes que posteriormente se autoricen | Reportes | Visualizar |
| `usuario.ver` | Consultar usuarios | Consultar perfiles, estado y roles asignados | Administración | Visualizar |
| `usuario.administrar` | Administrar usuarios | Crear, actualizar, desactivar usuarios y gestionar asignaciones de roles mediante el flujo autorizado | Administración | Administrar seguridad |
| `rol.ver` | Consultar roles y permisos | Consultar roles, permisos disponibles y sus relaciones | Administración | Visualizar |
| `rol.administrar` | Administrar roles y permisos | Crear o actualizar roles y gestionar sus asignaciones de permisos | Administración | Administrar seguridad |
| `auditoria.ver` | Consultar auditoría | Consultar acciones sensibles y sus datos permitidos | Auditoría | Sensible |

### Permisos que no se proponen todavía

- No se incluye `dashboard.ver`: el dashboard deberá mostrar únicamente indicadores permitidos por los módulos que el usuario pueda consultar.
- No se incluyen permisos `eliminar`: clientes, productos, ventas y documentos deben conservar historial mediante estado, desactivación o anulación.
- No se incluyen permisos `permiso.crear` o `permiso.editar`: los códigos de autorización son parte técnica del sistema. `rol.administrar` permite gestionar la asociación de permisos existentes con roles; cualquier administración libre del catálogo necesita análisis adicional.
- No se crean permisos por cada reporte porque aún no se ha definido el catálogo de reportes.
- No se separa todavía la edición de precios de `producto.editar`; esa necesidad debe resolverse antes de implementar el módulo.

## 5. Matriz de roles y permisos

Leyenda: `✓` permiso propuesto; `—` permiso no concedido inicialmente.

| Módulo | Permiso | Administrador | Encargado de ventas | Encargado de inventario | Empleado |
| --- | --- | :---: | :---: | :---: | :---: |
| Clientes | `cliente.ver` | ✓ | ✓ | — | ✓ |
| Clientes | `cliente.crear` | ✓ | ✓ | — | ✓ |
| Clientes | `cliente.editar` | ✓ | ✓ | — | — |
| Productos | `categoria.ver` | ✓ | ✓ | ✓ | ✓ |
| Productos | `categoria.administrar` | ✓ | — | ✓ | — |
| Productos | `producto.ver` | ✓ | ✓ | ✓ | ✓ |
| Productos | `producto.crear` | ✓ | — | ✓ | — |
| Productos | `producto.editar` | ✓ | — | ✓ | — |
| Inventario | `inventario.ver` | ✓ | ✓ | ✓ | ✓ |
| Inventario | `inventario.ver_movimientos` | ✓ | — | ✓ | — |
| Inventario | `inventario.registrar_movimiento` | ✓ | — | ✓ | — |
| Inventario | `inventario.ajustar` | ✓ | — | ✓ | — |
| Ventas | `venta.ver` | ✓ | ✓ | — | ✓ |
| Ventas | `venta.crear` | ✓ | ✓ | — | ✓ |
| Ventas | `venta.anular` | ✓ | — | — | — |
| Cotizaciones | `cotizacion.ver` | ✓ | ✓ | — | — |
| Cotizaciones | `cotizacion.crear` | ✓ | ✓ | — | — |
| Cotizaciones | `cotizacion.editar` | ✓ | ✓ | — | — |
| Cotizaciones | `cotizacion.convertir` | ✓ | ✓ | — | — |
| Facturación | `factura.ver` | ✓ | ✓ | — | — |
| Facturación | `factura.generar` | ✓ | ✓ | — | — |
| Reportes | `reporte.ver` | ✓ | — | — | — |
| Administración | `usuario.ver` | ✓ | — | — | — |
| Administración | `usuario.administrar` | ✓ | — | — | — |
| Administración | `rol.ver` | ✓ | — | — | — |
| Administración | `rol.administrar` | ✓ | — | — | — |
| Auditoría | `auditoria.ver` | ✓ | — | — | — |

La matriz representa el punto de partida más restrictivo. Un permiso marcado no elimina la necesidad de validar estado, propiedad del registro, límites de campo o reglas de negocio.

## 6. Criterios aplicados por rol

### Administrador

Recibe los 27 permisos porque debe configurar y supervisar el sistema. Esta amplitud no equivale a acceso sin controles: el backend, las validaciones, la auditoría y RLS seguirán aplicándose. Las acciones sensibles deben pedir confirmación y registrar su motivo cuando corresponda.

### Encargado de ventas

Recibe permisos operativos sobre clientes, ventas, cotizaciones y facturación, además de consultas mínimas de productos, categorías e inventario. No puede modificar productos o stock ni administrar seguridad. `venta.anular` se reserva inicialmente al Administrador.

### Encargado de inventario

Recibe permisos para categorías, productos, existencias y movimientos. Puede ajustar inventario porque corresponde a su responsabilidad, pero la acción debe exigir motivo, autorización backend y auditoría. No recibe acceso comercial ni administrativo.

### Empleado

Recibe permisos básicos para consultar catálogo y stock, registrar clientes y operar ventas. No puede editar clientes, crear cotizaciones, generar facturas, consultar movimientos ni ejecutar acciones sensibles. El alcance de sus consultas debe restringirse posteriormente si ECOFARM determina que solo puede ver operaciones propias.

## 7. Separación por tipo de acción

### Visualizar información

Los permisos terminados en `.ver` y `inventario.ver_movimientos` permiten consultar información. La consulta puede limitarse posteriormente por usuario, fecha, sucursal, estado u otra condición empresarial.

### Crear información

Incluye `cliente.crear`, `producto.crear`, `venta.crear` y `cotizacion.crear`. También incluye operaciones de creación con consecuencias especiales, como `inventario.registrar_movimiento` y `factura.generar`, que reciben controles adicionales.

### Modificar información

Incluye `cliente.editar`, `categoria.administrar`, `producto.editar` y `cotizacion.editar`. La modificación siempre depende del estado del registro; una venta confirmada o un documento emitido no debe editarse como un registro ordinario.

### Anular o realizar acciones sensibles

Incluye `venta.anular`, `inventario.ajustar`, `cotizacion.convertir`, `factura.generar` y `auditoria.ver`. Estas acciones pueden afectar existencias, documentos históricos o información sensible y requieren validación reforzada.

### Administrar seguridad

Incluye `usuario.administrar` y `rol.administrar`. Permite cambiar quién puede acceder al sistema y qué puede hacer, por lo que debe limitarse al Administrador y quedar auditado.

## 8. Acciones especialmente sensibles

| Permiso | Riesgo principal | Roles propuestos | Control futuro esperado |
| --- | --- | --- | --- |
| `venta.anular` | Modifica una operación confirmada y puede exigir compensar inventario o documentos | Administrador | Motivo, confirmación, transacción y auditoría |
| `inventario.registrar_movimiento` | Cambia existencias fuera del flujo automático de venta | Administrador, Encargado de inventario | Tipo, motivo, responsable y validación de cantidad |
| `inventario.ajustar` | Corrige directamente diferencias de stock | Administrador, Encargado de inventario | Motivo obligatorio, saldo anterior/resultante y auditoría |
| `cotizacion.convertir` | Crea una venta y debe evitar conversiones duplicadas | Administrador, Encargado de ventas | Validar estado, inventario y transacción |
| `factura.generar` | Produce un documento asociado con una venta | Administrador, Encargado de ventas | Venta válida, numeración y reglas fiscales definidas |
| `usuario.administrar` | Puede habilitar accesos o asignar roles | Administrador | Reautorización, validaciones y auditoría |
| `rol.administrar` | Puede ampliar privilegios propios o de terceros | Administrador | Impedir configuraciones inseguras y auditar cambios |
| `auditoria.ver` | Expone trazabilidad y posibles datos anteriores/nuevos | Administrador | Filtros autorizados y protección de datos sensibles |

`producto.editar` también puede volverse sensible si permite cambiar precios. Antes de implementarlo deberá decidirse si el precio requiere un permiso separado o una validación adicional.

## 9. Relación con el modelo de datos

La autorización futura seguirá esta cadena:

```text
usuario autenticado en auth.users
        ↓
perfiles
        ↓
usuarios_roles
        ↓
roles
        ↓
roles_permisos
        ↓
permisos
```

Supabase Auth comprobará la identidad. `usuarios_roles` indicará qué roles tiene el perfil y `roles_permisos` resolverá los códigos de permiso efectivos. No se guardarán contraseñas en tablas propias.

## 10. Capas futuras de autorización

Disponer de un permiso en la interfaz no será suficiente. La autorización deberá comprobarse de forma coordinada:

1. **Frontend React:** adapta navegación y controles para mejorar la experiencia, pero no constituye una barrera de seguridad.
2. **JWT de Supabase:** identifica al usuario autenticado; no debe confiarse en datos de identidad enviados manualmente por el cliente.
3. **Backend Express:** valida el token, resuelve roles y permisos, comprueba reglas de negocio y decide si ejecuta la acción.
4. **RLS de PostgreSQL/Supabase:** limita el acceso directo a filas cuando corresponda y actúa como una capa adicional.
5. **Auditoría:** registra acciones críticas autorizadas y sus resultados relevantes.

Ocultar un botón no evita que alguien intente llamar directamente al endpoint. Del mismo modo, tener un permiso general no elimina validaciones como estado de venta, stock disponible o propiedad del registro.

## 11. Decisiones pendientes

Antes o durante la implementación deben resolverse estas dudas reales con ECOFARM:

- ¿El Encargado de ventas puede anular ventas o necesita aprobación del Administrador?
- ¿Un Empleado puede consultar todas las ventas o únicamente las registradas por él?
- ¿Un Empleado puede crear cotizaciones, consultarlas o convertirlas?
- ¿Un Empleado puede generar o reimprimir documentos de facturación de sus propias ventas?
- ¿Quién puede modificar precios y descuentos de productos?
- ¿`producto.editar` debe excluir el precio o dividirse en un permiso específico?
- ¿Toda entrada o salida manual de inventario requiere aprobación adicional?
- ¿Qué límites o motivos se exigirán para ajustes de inventario?
- ¿Qué reportes existirán y cuáles corresponden a ventas, inventario, administración o dirección?
- ¿`reporte.ver` debe dividirse por tipo de reporte cuando exista el catálogo definitivo?
- ¿Existen supervisores, cajeros u otros cargos reales que no correspondan a los cuatro roles iniciales?
- ¿Puede un usuario tener varios roles y, si puede, los permisos siempre se acumulan?
- ¿Cómo se evitará desactivar al último Administrador activo?
- ¿Quién puede consultar auditoría y qué datos deben ocultarse dentro de cada evento?
- ¿El sistema manejará sucursales o cajas que requieran restringir información por ubicación?
- ¿Cuál será el alcance real de `factura.generar` antes de definir facturación interna o FEL?

Hasta resolver estas preguntas no deben agregarse roles nuevos ni permisos más específicos únicamente por anticipación.

## 12. Uso futuro y control de cambios

Esta matriz servirá posteriormente para preparar datos iniciales, middleware de autorización, protección de rutas y políticas RLS. Cada implementación deberá utilizar los mismos códigos documentados o actualizar primero este documento mediante una decisión revisada.

Crear roles o permisos en la base de datos, asignarlos a usuarios y definir políticas de acceso serán tareas separadas. Este documento no autoriza ninguna de esas acciones.
