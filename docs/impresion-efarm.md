# E-farm | Documentos, PDF e impresora de tickets

## Atajos directos después de cobrar

Al confirmar la venta en **Ventas → Nueva venta**, el sistema se mantiene en el POS y muestra **Venta confirmada** con total, pago recibido, cambio y un selector de comprobante (**Recibo** o **Factura de prueba**). Allí mismo aparecen **Vista previa**, **Descargar PDF**, **Imprimir**, **Ver detalle** y **Nueva venta**.

Los atajos **solo están disponibles después de confirmar la venta** y requieren permiso de consulta. La aplicación carga los documentos mediante una petición de solo lectura. Si la lectura falla, aparece **Reintentar documento**: nunca se ejecuta otra venta por intentar imprimir.

## Qué está disponible

Desde **Ventas → Historial → Ver detalle** se puede elegir entre **Recibo** (si ya fue emitido) y **Factura de prueba**. Las acciones disponibles son:

- **Vista previa:** abre el PDF formal tamaño carta con logo, datos del cliente, detalle de productos y totales.
- **Descargar PDF:** guarda ese mismo PDF formal tamaño carta, listo para enviar o archivar.
- **Imprimir:** abre el diálogo de impresión del navegador con diseño de ticket de 80 mm.
- **Más opciones → Imprimir en carta:** usa el formato existente para papel carta.

Desde **Cotizaciones → Ver detalle** están disponibles Vista previa y Descargar PDF en formato comercial carta, además de Imprimir en ticket de 80 mm y la opción de hoja carta.

## Configuración sugerida de impresora térmica de 80 mm

1. Instalar en Windows el controlador oficial de la impresora que se adquiera.
2. Elegir la impresora térmica en el diálogo de impresión del navegador.
3. Seleccionar papel de **80 mm** o tamaño de rollo equivalente. El largo varía según el contenido; puede depender de la configuración del controlador.
4. Usar escala **100 %**, márgenes **ninguno** y desactivar encabezados/pies del navegador.
5. Imprimir primero un documento de prueba para verificar que la impresora no recorte texto ni deje demasiado papel vacío.

La aplicación no manda datos crudos por USB ni imprime silenciosamente. Usa el diálogo estándar del navegador, por lo que **no hace falta conectar una impresora para probar Vista previa y PDF**.

## Reglas importantes

- Consultar un detalle, previsualizar, descargar o imprimir **no crea una venta ni mueve dinero o inventario**.
- Se imprimen los datos almacenados en el detalle existente.
- La **Factura de prueba** incluye la leyenda **«DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL»** y no sustituye una factura FEL certificada.
- El recibo requiere que la venta tenga recibo emitido.
- Las cotizaciones no representan una venta confirmada.
- La impresión debe ensayarse en la impresora real una vez esté disponible.

## Validación local

Desde la carpeta `frontend`:

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run build
node --test src/utils/documentosComerciales.test.js src/utils/documentosFormales.test.js
$env:VITE_API_URL = "http://localhost:5173"
npm.cmd run dev
```

Después iniciar sesión, entrar a **Ventas → Historial → Ver detalle** y revisar las acciones con una venta registrada. También probar **Cotizaciones → Ver detalle**. Comprobar un documento largo y una venta anulada.

Esta rama contiene la integración de PDF junto con el nuevo frontend. **No se debe fusionar en producción sin validar el resultado.**

## Separación de diseños

- **Vista previa / Descargar PDF:** documento formal **carta**, como los comprobantes de archivo de E-farm. Recibo y factura de demostración incluyen logo, comprador, documento, tabla y totales; cotizaciones siguen el mismo diseño.
- **Imprimir:** ticket **térmico 80 mm**, con altura adaptada a la cantidad de renglones.
- **Más opciones → Imprimir en carta:** conserva la impresión HTML existente desde el navegador.
- El PDF formal se construye con texto vectorial y el logotipo integrado. No necesita una dependencia npm adicional.
