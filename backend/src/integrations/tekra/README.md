# Integración TEKRA

Esta carpeta delimita la futura integración exclusiva del backend con TEKRA.
La Fase 2A no incluye cliente HTTP/SOAP, generación de XML, endpoints ni
credenciales porque el contrato técnico del certificador aún no está aprobado.

El flujo futuro debe:

1. construir el XML desde la Venta persistida, nunca desde importes enviados
   nuevamente por el frontend;
2. reclamar la Factura mediante `reclamar_factura_fel` y conservar su token;
3. enviar exactamente el XML persistido por el claim;
4. finalizar mediante `finalizar_factura_fel` usando el mismo token;
5. clasificar timeouts posteriores al envío como `resultado_incierto`;
6. conciliar el identificador con TEKRA antes de habilitar un nuevo envío.

Nunca deben registrarse credenciales, encabezados de autenticación ni respuestas
sin sanitizar. Las credenciales futuras vivirán únicamente en el entorno del
backend.
