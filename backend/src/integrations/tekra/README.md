# Integración TEKRA FEL

La Fase 2B-1 prepara el cliente SOAP 1.1, el XML `FACT`, el parser seguro y
el flujo de claim/finalización. No existe un worker automático y ningún módulo
realiza llamadas durante su importación.

El PDF certificado se mantiene como `Buffer` solamente durante el
procesamiento. El worker futuro debe guardarlo en un bucket privado y enviar
solo su ruta a `finalizar_factura_fel`. No se almacena PDF Base64 en PostgreSQL.

## Configuración documentada

Estas variables deben vivir exclusivamente en el entorno del backend. Los
valores siguientes son marcadores y no deben copiarse como datos reales:

```text
TEKRA_SOAP_ENDPOINT=<URL_HTTPS_CONFIRMADA_POR_TEKRA>
TEKRA_SOAP_NAMESPACE=<NAMESPACE_CONFIRMADO_DEL_WSDL>
TEKRA_SOAP_ACTION=<SOAP_ACTION_CONFIRMADO_DEL_WSDL>
TEKRA_TIMEOUT_MS=<MILISEGUNDOS>
TEKRA_MAX_RESPUESTA_BYTES=<LIMITE_BYTES>
TEKRA_MAX_PDF_BYTES=<LIMITE_BYTES>
TEKRA_USUARIO=<SECRETO_EN_ENTORNO>
TEKRA_CLAVE=<SECRETO_EN_ENTORNO>
TEKRA_CLIENTE=<VALOR_CONFIRMADO>
TEKRA_CONTRATO=<VALOR_CONFIRMADO>
TEKRA_ID_ORIGEN=<VALOR_CONFIRMADO>
TEKRA_IP_ORIGEN=<IP_CONFIRMADA>
TEKRA_FIRMAR_EMISOR=<SI_O_NO_CONFIRMADO>
TEKRA_VALIDAR_IDENTIFICADOR=SI

FEL_XML_CONTRATO_CONFIRMADO=SI
FEL_EMISOR_NIT=<NIT_REAL_CONFIRMADO>
FEL_EMISOR_NOMBRE=<RAZON_SOCIAL_CONFIRMADA>
FEL_EMISOR_NOMBRE_COMERCIAL=<NOMBRE_CONFIRMADO>
FEL_EMISOR_AFILIACION_IVA=<AFILIACION_CONFIRMADA>
FEL_EMISOR_CODIGO_ESTABLECIMIENTO=<CODIGO_CONFIRMADO>
FEL_EMISOR_CORREO=<CORREO_CONFIRMADO_OPCIONAL>
FEL_EMISOR_DIRECCION=<DIRECCION_CONFIRMADA>
FEL_EMISOR_CODIGO_POSTAL=<CODIGO_CONFIRMADO>
FEL_EMISOR_MUNICIPIO=<MUNICIPIO_CONFIRMADO>
FEL_EMISOR_DEPARTAMENTO=<DEPARTAMENTO_CONFIRMADO>
FEL_EMISOR_PAIS=<PAIS_CONFIRMADO>
FEL_FRASES_JSON=<ARREGLO_JSON_CONFIRMADO>
```

No se modificó `.env` ni `.env.example` y no hay valores reales en el
repositorio. El cargador rechaza HTTP y exige
`TEKRA_VALIDAR_IDENTIFICADOR=SI`.

## Origen de los datos

`crearRepositorioFelPersistido` carga exclusivamente:

- `facturas_fel`: identidad, receptor, total, XML previo y conciliación;
- `ventas`: estado, número, total y fecha persistida;
- `venta_detalles`: cantidades, precios y snapshots del producto.

El generador verifica con aritmética decimal basada en `BigInt` que cada
cantidad por precio coincide con su subtotal y que la suma coincide con los
totales persistidos. No acepta precios ni impuestos procedentes de una
solicitud frontend.

La base actual solo conserva una dirección libre del comprador. Por ello es
obligatorio inyectar un resolver aprobado para código postal, municipio,
departamento y país. También es obligatorio inyectar el tratamiento fiscal
confirmado de cada línea. No hay reglas implícitas de IVA, exención,
redondeo o unidad de medida.

## Idempotencia y errores inciertos

1. Se carga la Factura y la Venta persistidas.
2. Si ya existe `xml_solicitud`, se valida y se reutiliza sin regenerarlo.
3. El XML usa `facturas_fel.id` como `Adenda.DECertificador` estable.
4. `reclamar_factura_fel` almacena el XML y entrega un token a un solo worker.
5. Solo el worker que conserva ese token puede finalizar.
6. Timeout, error de red, respuesta excesiva o respuesta imposible de validar
   producen `resultado_incierto`.
7. `resultado_incierto` activa `requiere_conciliacion`; no se genera otro
   identificador ni se reenvía el documento.

Los rechazos explícitos y `SOAP Fault` se clasifican, pero esta fase no los
convierte automáticamente en `error_reintentable`: falta confirmar con TEKRA
qué códigos permiten reintento y cuáles requieren corrección humana.

## Seguridad XML y transporte

- El DTE se inserta en `Documento` mediante CDATA dividido de forma segura si
  aparece `]]>`.
- Textos y atributos XML se escapan antes de serializarse.
- El parser rechaza DTD, `ENTITY`, entidades desconocidas, XML desbalanceado,
  profundidad excesiva y respuestas por encima del límite configurado.
- El PDF exige Base64 canónico y la firma `%PDF-`.
- No se registran credenciales, XML, respuestas completas ni PDF Base64.
- El endpoint HTTP mostrado por el manual queda bloqueado. No deben enviarse
  credenciales hasta que TEKRA confirme HTTPS o un transporte cifrado aprobado.

## Contrato contrastado con el manual TEKRA v1.3

La implementación refleja los puntos verificables del manual original sin
guardar el PDF en el repositorio:

- SOAP 1.1 y operación `CertificacionDocumento` bajo el namespace indicado por
  el WSDL configurado;
- los ocho campos documentados de `Autenticacion`;
- `Documento` con el DTE dentro de CDATA;
- `ResultadoCertificacion` como JSON y éxito únicamente con `error` entero `0`;
- `frases`, `mensajes_marcas` y `errores_xsd` conservados como metadatos para
  revisión, sin registrar la respuesta SOAP completa;
- `DocumentoCertificado` y `RepresentacionGrafica` como nodos hermanos de
  `ResultadoCertificacion`, no como propiedades de ese JSON;
- UUID en el texto de `NumeroAutorizacion`, serie y número en sus atributos
  `Serie` y `Numero`, y fecha en `FechaHoraCertificacion`;
- `DECertificador` estable y `pn_validar_identificador=SI` para recuperar una
  certificación previa según el identificador;
- namespaces que el manual declara obligatorios en `GTDocumento`, y `Adenda`
  dentro de `SAT`.

## Confirmaciones pendientes antes de conectar

El manual declara reglas SAT FEL 1.7.4 y un endpoint de pruebas HTTP; ambos
pueden estar desactualizados. Antes de habilitar producción deben confirmarse:

- endpoint HTTPS o transporte cifrado aprobado, namespace del WSDL oficial y
  valor exacto de `SOAPAction`;
- XSD y reglas SAT vigentes, incluido el orden definitivo de nodos y campos;
- afiliación IVA, frases, códigos de escenario y establecimiento reales;
- dirección fiscal estructurada requerida para cada receptor;
- tratamiento de `CF`, bienes/servicios, unidades, IVA, exenciones,
  descuentos, precisión y redondeos;
- catálogo de rechazos reintentables y procedimiento de conciliación por
  `DECertificador` con `pn_validar_identificador=SI`.

Las pruebas usan mocks y verifican estructura y controles locales. No
constituyen una certificación real ni una validación contra el XSD de SAT.
