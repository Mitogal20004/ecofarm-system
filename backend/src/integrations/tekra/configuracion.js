import { ErrorConfiguracionTekra } from './errores.js'

const leerTexto = (entorno, nombre, { opcional = false } = {}) => {
  const valor = entorno[nombre]

  if (typeof valor !== 'string' || !valor.trim()) {
    if (opcional) return null
    throw new ErrorConfiguracionTekra(`Falta la configuración ${nombre}.`)
  }

  return valor.trim()
}

const leerEntero = (entorno, nombre, valorPredeterminado) => {
  const valor = entorno[nombre]
  if (valor === undefined || valor === '') return valorPredeterminado

  const numero = Number(valor)
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorConfiguracionTekra(`${nombre} debe ser un entero positivo.`)
  }

  return numero
}

const leerSiNo = (entorno, nombre) => {
  const valor = leerTexto(entorno, nombre).toUpperCase()
  if (valor !== 'SI' && valor !== 'NO') {
    throw new ErrorConfiguracionTekra(`${nombre} debe ser SI o NO.`)
  }
  return valor
}

const leerUrlHttps = (entorno, nombre) => {
  const texto = leerTexto(entorno, nombre)
  let url

  try {
    url = new URL(texto)
  } catch {
    throw new ErrorConfiguracionTekra(`${nombre} no es una URL válida.`)
  }

  if (url.protocol !== 'https:') {
    throw new ErrorConfiguracionTekra(
      `${nombre} debe utilizar HTTPS antes de enviar credenciales.`,
    )
  }

  return url.toString()
}

const leerFrases = (entorno) => {
  const texto = leerTexto(entorno, 'FEL_FRASES_JSON')
  let frases

  try {
    frases = JSON.parse(texto)
  } catch {
    throw new ErrorConfiguracionTekra('FEL_FRASES_JSON no contiene JSON válido.')
  }

  if (
    !Array.isArray(frases) ||
    frases.length === 0 ||
    frases.some(
      (frase) =>
        !frase ||
        typeof frase !== 'object' ||
        typeof frase.tipoFrase !== 'string' ||
        !frase.tipoFrase.trim() ||
        typeof frase.codigoEscenario !== 'string' ||
        !frase.codigoEscenario.trim(),
    )
  ) {
    throw new ErrorConfiguracionTekra(
      'FEL_FRASES_JSON debe declarar frases fiscales confirmadas.',
    )
  }

  return frases.map((frase) => ({
    tipoFrase: frase.tipoFrase.trim(),
    codigoEscenario: frase.codigoEscenario.trim(),
  }))
}

export function cargarConfiguracionTekra(entorno = process.env) {
  const validarIdentificador = leerSiNo(
    entorno,
    'TEKRA_VALIDAR_IDENTIFICADOR',
  )

  if (validarIdentificador !== 'SI') {
    throw new ErrorConfiguracionTekra(
      'TEKRA_VALIDAR_IDENTIFICADOR debe permanecer en SI para idempotencia.',
    )
  }

  return {
    endpoint: leerUrlHttps(entorno, 'TEKRA_SOAP_ENDPOINT'),
    namespaceOperacion: leerTexto(entorno, 'TEKRA_SOAP_NAMESPACE'),
    soapAction: leerTexto(entorno, 'TEKRA_SOAP_ACTION'),
    timeoutMs: leerEntero(entorno, 'TEKRA_TIMEOUT_MS', 15000),
    maxRespuestaBytes: leerEntero(
      entorno,
      'TEKRA_MAX_RESPUESTA_BYTES',
      25 * 1024 * 1024,
    ),
    maxPdfBytes: leerEntero(
      entorno,
      'TEKRA_MAX_PDF_BYTES',
      20 * 1024 * 1024,
    ),
    autenticacion: {
      pn_usuario: leerTexto(entorno, 'TEKRA_USUARIO'),
      pn_clave: leerTexto(entorno, 'TEKRA_CLAVE'),
      pn_cliente: leerTexto(entorno, 'TEKRA_CLIENTE'),
      pn_contrato: leerTexto(entorno, 'TEKRA_CONTRATO'),
      pn_id_origen: leerTexto(entorno, 'TEKRA_ID_ORIGEN'),
      pn_ip_origen: leerTexto(entorno, 'TEKRA_IP_ORIGEN'),
      pn_firmar_emisor: leerSiNo(entorno, 'TEKRA_FIRMAR_EMISOR'),
      pn_validar_identificador: validarIdentificador,
    },
  }
}

export function cargarConfiguracionFiscalFel(entorno = process.env) {
  if (leerTexto(entorno, 'FEL_XML_CONTRATO_CONFIRMADO') !== 'SI') {
    throw new ErrorConfiguracionTekra(
      'El contrato XML FEL debe confirmarse antes de generar documentos.',
    )
  }

  return {
    contratoXmlConfirmado: true,
    emisor: {
      nit: leerTexto(entorno, 'FEL_EMISOR_NIT'),
      nombre: leerTexto(entorno, 'FEL_EMISOR_NOMBRE'),
      nombreComercial: leerTexto(entorno, 'FEL_EMISOR_NOMBRE_COMERCIAL'),
      afiliacionIva: leerTexto(entorno, 'FEL_EMISOR_AFILIACION_IVA'),
      codigoEstablecimiento: leerTexto(
        entorno,
        'FEL_EMISOR_CODIGO_ESTABLECIMIENTO',
      ),
      correo: leerTexto(entorno, 'FEL_EMISOR_CORREO', { opcional: true }),
      direccion: {
        direccion: leerTexto(entorno, 'FEL_EMISOR_DIRECCION'),
        codigoPostal: leerTexto(entorno, 'FEL_EMISOR_CODIGO_POSTAL'),
        municipio: leerTexto(entorno, 'FEL_EMISOR_MUNICIPIO'),
        departamento: leerTexto(entorno, 'FEL_EMISOR_DEPARTAMENTO'),
        pais: leerTexto(entorno, 'FEL_EMISOR_PAIS'),
      },
    },
    frases: leerFrases(entorno),
  }
}
