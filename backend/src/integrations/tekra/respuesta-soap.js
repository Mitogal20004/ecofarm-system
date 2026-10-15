import { ErrorRespuestaTekra } from './errores.js'
import {
  buscarPrimerNodoLocal,
  contenidoXmlNodo,
  parsearXmlSeguro,
  textoNodo,
  textoProfundoNodo,
} from './xml-seguro.js'

const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const NAMESPACE_SOAP_11 = 'http://schemas.xmlsoap.org/soap/envelope/'
const NAMESPACE_DTE = 'http://www.sat.gob.gt/dte/fel/0.2.0'

const extraerTextoObligatorio = (raiz, nombre) => {
  const nodo = buscarPrimerNodoLocal(raiz, nombre)
  const texto = nodo ? textoNodo(nodo) : ''

  if (!texto) {
    throw new ErrorRespuestaTekra(
      `El certificado no contiene el campo ${nombre}.`,
    )
  }

  return texto
}

const validarPdfBase64 = (base64, maxPdfBytes) => {
  if (typeof base64 !== 'string') {
    throw new ErrorRespuestaTekra('La representación gráfica no es Base64.')
  }

  const normalizado = base64.replace(/\s+/g, '')
  const bytesEstimados = Math.floor((normalizado.length * 3) / 4)

  if (
    !normalizado ||
    normalizado.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizado) ||
    bytesEstimados > maxPdfBytes
  ) {
    throw new ErrorRespuestaTekra('La representación gráfica no es Base64 válido.')
  }

  const pdf = Buffer.from(normalizado, 'base64')

  if (pdf.toString('base64') !== normalizado || pdf.length > maxPdfBytes) {
    throw new ErrorRespuestaTekra('La representación gráfica no es Base64 válido.')
  }

  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new ErrorRespuestaTekra('La representación gráfica no contiene un PDF.')
  }

  return pdf
}

const buscarMensaje = (valor, profundidad = 0) => {
  if (profundidad > 4) return null
  if (typeof valor === 'string' && valor.trim()) {
    return valor.trim().slice(0, 1000)
  }
  if (Array.isArray(valor)) {
    for (const elemento of valor) {
      const mensaje = buscarMensaje(elemento, profundidad + 1)
      if (mensaje) return mensaje
    }
  }
  if (valor && typeof valor === 'object') {
    for (const campo of [
      'mensaje',
      'message',
      'descripcion',
      'description',
      'error',
    ]) {
      const mensaje = buscarMensaje(valor[campo], profundidad + 1)
      if (mensaje) return mensaje
    }
  }
  return null
}

const mensajeErrorTekra = (resultado) => {
  for (const campo of [
    'errores_xsd',
    'mensaje',
    'mensajes_marcas',
    'mensaje_marcas',
    'frases',
  ]) {
    const mensaje = buscarMensaje(resultado[campo])
    if (mensaje) return mensaje
  }

  return `TEKRA rechazó el documento con código ${resultado.error}.`
}

const extraerIdentidadCertificada = (xmlCertificado, maxRespuestaBytes) => {
  const certificado = parsearXmlSeguro(xmlCertificado, {
    maxBytes: maxRespuestaBytes,
  })

  if (
    certificado.nombreLocal !== 'GTDocumento' ||
    resolverNamespace(certificado, []) !== NAMESPACE_DTE
  ) {
    throw new ErrorRespuestaTekra(
      'DocumentoCertificado no contiene un GTDocumento FEL 0.2.0.',
    )
  }

  const numeroAutorizacion = buscarPrimerNodoLocal(
    certificado,
    'NumeroAutorizacion',
  )
  const uuid = numeroAutorizacion ? textoNodo(numeroAutorizacion) : ''
  const serie = numeroAutorizacion?.atributos.get('Serie')?.trim() ?? ''
  const numero = numeroAutorizacion?.atributos.get('Numero')?.trim() ?? ''
  const fechaCertificacion = extraerTextoObligatorio(
    certificado,
    'FechaHoraCertificacion',
  )

  if (!PATRON_UUID.test(uuid) || !serie || !numero) {
    throw new ErrorRespuestaTekra(
      'NumeroAutorizacion no contiene UUID, serie y número válidos.',
    )
  }

  if (serie.length > 100 || numero.length > 100) {
    throw new ErrorRespuestaTekra('La serie o número certificado excede el límite.')
  }

  if (
    !PATRON_FECHA_CON_ZONA.test(fechaCertificacion) ||
    !Number.isFinite(Date.parse(fechaCertificacion))
  ) {
    throw new ErrorRespuestaTekra(
      'La fecha de certificación no incluye una zona horaria válida.',
    )
  }

  return { uuid, serie, numero, fechaCertificacion }
}

const buscarHijoLocal = (nodo, nombreLocal) =>
  nodo.hijos.find((hijo) => hijo.nombreLocal === nombreLocal) ?? null

const resolverNamespace = (nodo, ancestros) => {
  const prefijo = nodo.nombre.includes(':') ? nodo.nombre.split(':')[0] : null
  const atributo = prefijo ? `xmlns:${prefijo}` : 'xmlns'

  for (const candidato of [...ancestros, nodo].reverse()) {
    if (candidato.atributos.has(atributo)) {
      return candidato.atributos.get(atributo)
    }
  }

  return null
}

const parsearResultadoJson = (texto) => {
  try {
    const resultado = JSON.parse(texto)

    if (!resultado || typeof resultado !== 'object' || Array.isArray(resultado)) {
      throw new TypeError('Resultado no es un objeto')
    }

    return resultado
  } catch (error) {
    throw new ErrorRespuestaTekra(
      'ResultadoCertificacion no contiene JSON válido.',
      error,
    )
  }
}

const metadatosResultado = (resultado) => ({
  frases: resultado.frases ?? null,
  mensajes_marcas:
    resultado.mensajes_marcas ?? resultado.mensaje_marcas ?? null,
  errores_xsd: resultado.errores_xsd ?? null,
})

export function parsearRespuestaCertificacionSoap(
  xmlSoap,
  {
    maxRespuestaBytes = 25 * 1024 * 1024,
    maxPdfBytes = 20 * 1024 * 1024,
    namespaceOperacion = null,
  } = {},
) {
  const sobre = parsearXmlSeguro(xmlSoap, { maxBytes: maxRespuestaBytes })

  if (sobre.nombreLocal !== 'Envelope') {
    throw new ErrorRespuestaTekra('La respuesta no contiene un SOAP Envelope.')
  }

  const prefijoSobre = sobre.nombre.includes(':')
    ? sobre.nombre.split(':')[0]
    : null
  const atributoNamespace = prefijoSobre ? `xmlns:${prefijoSobre}` : 'xmlns'

  if (sobre.atributos.get(atributoNamespace) !== NAMESPACE_SOAP_11) {
    throw new ErrorRespuestaTekra('La respuesta no utiliza SOAP 1.1.')
  }

  const cuerpo = sobre.hijos.find((hijo) => hijo.nombreLocal === 'Body')
  if (!cuerpo) {
    throw new ErrorRespuestaTekra('La respuesta no contiene un SOAP Body.')
  }

  const fault = cuerpo.hijos.find((hijo) => hijo.nombreLocal === 'Fault')
  if (fault) {
    const codigo = buscarPrimerNodoLocal(fault, 'faultcode')
    const mensaje = buscarPrimerNodoLocal(fault, 'faultstring')

    return {
      tipo: 'soap_fault',
      codigo: codigo ? textoNodo(codigo).slice(0, 200) : null,
      mensaje: mensaje
        ? textoNodo(mensaje).slice(0, 1000)
        : textoProfundoNodo(fault).slice(0, 1000),
      respuestaCertificador: {
        error: true,
        tipo: 'soap_fault',
      },
    }
  }

  const respuesta = buscarHijoLocal(cuerpo, 'CertificacionDocumentoResponse')
  if (!respuesta) {
    throw new ErrorRespuestaTekra(
      'La respuesta no contiene CertificacionDocumentoResponse.',
    )
  }

  if (
    namespaceOperacion &&
    resolverNamespace(respuesta, [sobre, cuerpo]) !== namespaceOperacion
  ) {
    throw new ErrorRespuestaTekra(
      'La respuesta no utiliza el namespace configurado para TEKRA.',
    )
  }

  const nodoResultado = buscarHijoLocal(respuesta, 'ResultadoCertificacion')
  if (!nodoResultado) {
    throw new ErrorRespuestaTekra(
      'La respuesta no contiene ResultadoCertificacion.',
    )
  }

  const resultado = parsearResultadoJson(textoNodo(nodoResultado))

  if (!Number.isInteger(resultado.error)) {
    throw new ErrorRespuestaTekra(
      'ResultadoCertificacion no contiene un código error entero.',
    )
  }

  if (resultado.error !== 0) {
    const mensaje = mensajeErrorTekra(resultado)
    return {
      tipo: 'rechazada',
      mensaje,
      respuestaCertificador: {
        error: true,
        codigo: resultado.error,
        mensaje,
        ...metadatosResultado(resultado),
      },
    }
  }

  const nodoDocumento = buscarHijoLocal(respuesta, 'DocumentoCertificado')
  const xmlCertificado = nodoDocumento
    ? nodoDocumento.hijos.length > 0
      ? contenidoXmlNodo(xmlSoap, nodoDocumento)
      : textoNodo(nodoDocumento)
    : ''

  if (!xmlCertificado) {
    throw new ErrorRespuestaTekra(
      'La respuesta exitosa no contiene DocumentoCertificado.',
    )
  }

  const identidad = extraerIdentidadCertificada(
    xmlCertificado,
    maxRespuestaBytes,
  )
  const nodoPdf = buscarHijoLocal(respuesta, 'RepresentacionGrafica')
  const pdf = validarPdfBase64(nodoPdf ? textoNodo(nodoPdf) : null, maxPdfBytes)

  return {
    tipo: 'certificada',
    uuidFel: identidad.uuid,
    serieFel: identidad.serie,
    numeroFel: identidad.numero,
    fechaCertificacion: identidad.fechaCertificacion,
    xmlCertificado,
    pdf,
    respuestaCertificador: {
      error: false,
      codigo: resultado.error,
      ...metadatosResultado(resultado),
      documentoCertificadoRecibido: true,
      representacionGraficaRecibida: true,
    },
  }
}
