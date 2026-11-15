# Correos y alertas

El backend utiliza Resend para enviar alertas operativas. El envío es asíncrono: un fallo del proveedor no revierte ni bloquea una venta, un cierre de caja o un movimiento de inventario.

## Configuración

En `backend/.env`:

```env
EMAIL_ALERTS_ENABLED=true
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=alertas@tu-dominio-verificado.com
RESEND_FROM_NAME=E-farm
ALERT_RECIPIENTS=admin@empresa.com,supervisor@empresa.com
ALERT_DEDUPE_MS=3600000
ALERT_PERSIST_ENABLED=true
```

El dominio utilizado en `RESEND_FROM_EMAIL` debe estar verificado en Resend. La API key solo debe existir en el backend y nunca en variables `VITE_*`.

Para las alertas de stock, el sistema consulta automáticamente los correos de
usuarios activos que tengan el rol `jefe` o `administrador`. `ALERT_RECIPIENTS`
queda como respaldo si la consulta por roles no encuentra destinatarios.

## Alertas actuales

- `caja.diferencia`: diferencia distinta de cero al cerrar caja.
- `inventario.stock_bajo`: stock de flores igual o inferior al mínimo configurado.
- `insumo.stock_bajo`: stock de un insumo activo igual o inferior al mínimo configurado.
- `usuarios.usuario_creado`: creación de un usuario operativo.

Las alertas se deduplican temporalmente con `ALERT_DEDUPE_MS`. Cuando `ALERT_PERSIST_ENABLED=true`, también se registran en la tabla `public.alertas`; aplica antes la migración `20261113010000_crear_alertas.sql`.

## Prueba

Después de configurar las variables, reinicia el backend y ejecuta una operación que produzca una alerta. Revisa el panel de Resend y la tabla `public.alertas`. No se incluye un endpoint público para enviar correos arbitrarios.
