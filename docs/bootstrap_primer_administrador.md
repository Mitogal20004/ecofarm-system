# Bootstrap del primer Administrador de ECOFARM S.A.

Este documento describe un procedimiento manual, reproducible y de uso único para vincular el primer usuario de Supabase Auth con el modelo de autorización de ECOFARM. La plantilla incluida no ha sido ejecutada y no contiene datos reales.

## 1. Propósito

ECOFARM necesita un primer Administrador para iniciar la gestión interna antes de que exista un flujo administrativo de creación de usuarios.

El procedimiento permite:

1. crear manualmente la identidad en Supabase Auth;
2. crear el perfil correspondiente en `public.perfiles`;
3. asignar el rol existente `Administrador` en `public.usuarios_roles`;
4. comprobar que el rol conserva sus 27 permisos documentados.

Este bootstrap no habilita registro público y no debe reutilizarse como mecanismo habitual para crear empleados.

## 2. Estructura utilizada

### `public.perfiles`

| Columna | Uso en el bootstrap |
| --- | --- |
| `id` | UUID generado por Supabase Auth; es PK y FK a `auth.users.id` |
| `nombre_completo` | Nombre interno visible en ECOFARM |
| `nombre_usuario` | Identificador utilizado para iniciar sesión |
| `telefono` | Dato opcional |
| `serie_documentos` | Serie interna única para documentos comerciales |
| `activo` | Utiliza el valor predeterminado `true` |
| `fecha_creacion` | Utiliza el valor predeterminado |
| `fecha_actualizacion` | Utiliza el valor predeterminado |

### `public.roles`

El rol se localizará mediante `nombre = 'Administrador'`. `nombre` tiene una restricción UNIQUE, por lo que identifica un único rol sin escribir manualmente su UUID.

### `public.usuarios_roles`

La relación se forma con:

- `usuario_id`: UUID compartido por `auth.users` y `public.perfiles`;
- `rol_id`: UUID obtenido mediante el nombre único del rol;
- `fecha_asignacion`: valor predeterminado de la tabla.

Su PK compuesta impide asignar dos veces el mismo rol al mismo usuario.

## 3. Crear manualmente el usuario

La identidad debe crearse desde el Dashboard del proyecto Supabase:

1. Ingresar al proyecto de ECOFARM con una cuenta administrativa autorizada.
2. Abrir **Authentication → Users**.
3. Elegir **Add user** y utilizar la opción administrativa apropiada para crear o invitar al primer usuario.
4. Introducir el correo real únicamente en el Dashboard.
5. Si el flujo solicita una contraseña, utilizar una contraseña fuerte, única y no compartida.
6. Completar la confirmación de correo según la configuración aprobada para el proyecto.

Supabase documenta la administración desde **Authentication → Users** en su [guía oficial de usuarios](https://supabase.com/docs/guides/auth/users).

No debe crearse el usuario desde React, mediante SQL sobre `auth.users` ni mediante una clave `service_role`. La contraseña debe permanecer bajo el manejo de Supabase Auth y de su propietario; nunca debe copiarse a archivos del proyecto, mensajes, capturas o Git.

## 4. Obtener el UUID del usuario

Después de crear la identidad:

1. Permanecer en **Authentication → Users**.
2. Abrir el detalle del usuario recién creado.
3. Localizar el campo de identificador o UUID del usuario.
4. Copiarlo temporalmente para sustituir `<UUID_DEL_USUARIO>` en el SQL del procedimiento.
5. Comprobar que el UUID corresponde exactamente al usuario correcto antes de ejecutar.

El UUID se utiliza tanto en `public.perfiles.id` como en `public.usuarios_roles.usuario_id`. No debe sustituirse por el correo ni generarse uno diferente.

Aunque un UUID no es una contraseña, el valor real identifica una cuenta concreta y varía entre ambientes. No debe escribirse en una migración, seed o documento versionado.

## 5. Preparar los datos

Antes de abrir el SQL Editor, preparar únicamente estos valores fuera del repositorio:

- `<UUID_DEL_USUARIO>`: UUID copiado desde Supabase Auth.
- `<NOMBRE_COMPLETO>`: nombre que se mostrará dentro de ECOFARM.
- `<TELEFONO_OPCIONAL>`: reemplazar por un texto SQL entre comillas simples, por ejemplo `'0000-0000'`, o por `NULL` sin comillas si no se registrará teléfono.
- `<NOMBRE_USUARIO>`: identificador de acceso en minúsculas, por ejemplo `'admin.ecofarm'`.
- `<SERIE_DOCUMENTOS>`: serie interna única, por ejemplo `'ADM'`.

Si el nombre o teléfono contiene una comilla simple, debe escaparse duplicándola según las reglas de PostgreSQL. No guardar una copia del SQL ya completado dentro del repositorio.

## 6. Plantilla SQL de bootstrap

> **No ejecutar sin reemplazar y revisar todos los placeholders.** Esta plantilla debe copiarse al SQL Editor de Supabase y completarse únicamente allí.

```sql
begin;

-- Crear el perfil con el mismo UUID generado por Supabase Auth.
insert into public.perfiles (
  id,
  nombre_completo,
  nombre_usuario,
  telefono,
  serie_documentos
)
values (
  '<UUID_DEL_USUARIO>'::uuid,
  '<NOMBRE_COMPLETO>',
  '<NOMBRE_USUARIO>',
  <TELEFONO_OPCIONAL>,
  '<SERIE_DOCUMENTOS>'
);

-- Asignar el rol por su nombre único, sin escribir manualmente su UUID.
insert into public.usuarios_roles (
  usuario_id,
  rol_id
)
values (
  '<UUID_DEL_USUARIO>'::uuid,
  (
    select roles.id
    from public.roles
    where roles.nombre = 'Administrador'
      and roles.activo = true
  )
);

commit;
```

La transacción garantiza que el perfil y la asignación se confirmen juntos. Si el UUID no existe en `auth.users`, el perfil ya existe, el rol no existe o la asignación es inválida, PostgreSQL debe mostrar el error. No se utiliza `ON CONFLICT DO NOTHING` porque ocultaría problemas que requieren revisión.

La subconsulta del rol devuelve su UUID. Como `usuarios_roles.rol_id` no permite `NULL`, la ausencia del rol `Administrador` provoca un error y evita confirmar un perfil sin rol.

Si ocurre cualquier error, no ejecutar instrucciones improvisadas para forzar el proceso. Revisar los placeholders, confirmar que las migraciones anteriores fueron aplicadas y volver a ejecutar la transacción completa cuando la causa esté resuelta.

## 7. Consultas de verificación

Estas consultas son de solo lectura. Deben ejecutarse después de que la transacción termine correctamente, sustituyendo únicamente `<UUID_DEL_USUARIO>`.

### 7.1 Verificar el perfil

```sql
select
  perfiles.id,
  perfiles.nombre_completo,
  perfiles.telefono,
  perfiles.activo,
  perfiles.fecha_creacion
from public.perfiles
where perfiles.id = '<UUID_DEL_USUARIO>'::uuid;
```

**Resultado esperado:** exactamente una fila, con el nombre revisado y `activo = true`.

### 7.2 Verificar la asignación del rol

```sql
select
  perfiles.id as usuario_id,
  perfiles.nombre_completo,
  roles.id as rol_id,
  roles.nombre as rol
from public.perfiles
join public.usuarios_roles
  on usuarios_roles.usuario_id = perfiles.id
join public.roles
  on roles.id = usuarios_roles.rol_id
where perfiles.id = '<UUID_DEL_USUARIO>'::uuid
  and roles.nombre = 'Administrador';
```

**Resultado esperado:** exactamente una fila con `rol = 'Administrador'`.

### 7.3 Verificar los permisos del Administrador

```sql
select
  perfiles.id as usuario_id,
  roles.nombre as rol,
  count(distinct permisos.id) as permisos_efectivos
from public.perfiles
join public.usuarios_roles
  on usuarios_roles.usuario_id = perfiles.id
join public.roles
  on roles.id = usuarios_roles.rol_id
join public.roles_permisos
  on roles_permisos.rol_id = roles.id
join public.permisos
  on permisos.id = roles_permisos.permiso_id
where perfiles.id = '<UUID_DEL_USUARIO>'::uuid
  and roles.nombre = 'Administrador'
  and roles.activo = true
  and permisos.activo = true
group by perfiles.id, roles.nombre;
```

**Resultado esperado:** una fila con `rol = 'Administrador'` y `permisos_efectivos = 27`.

Si el conteo no es 27, no agregar permisos manualmente sin revisar primero la migración de roles y permisos y la matriz aprobada.

## 8. RLS durante el bootstrap

RLS debe permanecer habilitado. No se deben crear políticas temporales ni desactivar la protección para completar este procedimiento.

El SQL Editor del Dashboard se utiliza como contexto administrativo para esta operación inicial. El procedimiento no debe ejecutarse desde React, con la publishable key ni mediante una solicitud pública. Las políticas RLS para usuarios autenticados se diseñarán y probarán en tareas posteriores.

## 9. Alcance único del procedimiento

Este procedimiento existe únicamente para establecer el primer Administrador cuando todavía no hay otro usuario autorizado que pueda gestionar cuentas.

Los usuarios posteriores deberán crearse mediante un flujo administrativo seguro que se implementará más adelante. Ese flujo tendrá que:

- comprobar `usuario.administrar` en el backend;
- utilizar una operación administrativa ejecutada desde un entorno confiable;
- crear el perfil y asignar roles de forma consistente;
- validar que no se amplíen privilegios indebidamente;
- registrar las acciones sensibles en auditoría.

No debe implementarse un formulario público de `signUp` en React. ECOFARM es un sistema interno y el servicio frontend actual solo prepara inicio de sesión, cierre y consulta de sesión.

## 10. Datos que nunca deben versionarse

- Contraseña del usuario.
- Correo real cuando forme parte de un script de bootstrap local.
- UUID real del usuario cuando se utilice en un script o consulta completada.
- Secret key.
- Clave `service_role`.
- Tokens de acceso o actualización.
- JWT completos.
- Enlaces de recuperación o invitación.
- Cualquier credencial privada o copia del SQL completado con datos reales.

Los placeholders de este documento son deliberadamente reconocibles para que la guía pueda versionarse sin identificar una cuenta real.

## 11. Lista de comprobación final

- [ ] El usuario fue creado manualmente en Supabase Auth.
- [ ] El correo pertenece a la persona correcta.
- [ ] La contraseña es fuerte y no fue copiada al repositorio.
- [ ] Se obtuvo el UUID desde el detalle correcto.
- [ ] Todos los placeholders fueron sustituidos en el SQL Editor.
- [ ] El teléfono se reemplazó por un texto SQL válido o por `NULL`.
- [ ] La transacción terminó sin errores.
- [ ] El perfil existe y está activo.
- [ ] El rol asignado es `Administrador`.
- [ ] El conteo de permisos efectivos es 27.
- [ ] RLS permaneció habilitado.
- [ ] No se guardó localmente una copia con datos reales.

Este documento prepara el procedimiento, pero no autoriza su ejecución automática ni la creación de usuarios mediante código.
