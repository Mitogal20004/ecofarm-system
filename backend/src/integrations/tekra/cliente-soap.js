import {
  ErrorConfiguracionTekra,
  ErrorResultadoInciertoTekra,
} from './errores.js'
import { parsearRespuestaCertificacionSoap } from './respuesta-soap.js'
import { escaparAtributoXml, escaparTextoXml, envolverCdata } from './xml-seguro.js'

const NAMESPACE_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
const CAMPOS_AUTENTICACION = [
  'pn_usuario',
  'pn_clave',
  'pn_cliente',
  'pn_contrato',
  'pn_id_origen',
  'pn_ip_origen',
  'pn_firmar_emisor',
  'pn_validar_identificador',
]

const validarConfiguracion = (configuracion) => {
  if (!configuracion || typeof configuracion !== 'object') {
    throw new ErrorConfiguracionTekra('Falta la configuración SOAP de TEKRA.')
  }

  let endpoint
  try {
    endpoint = new URL(configuracion.endpoint)
  } catch {
    throw new ErrorConfiguracionTekra('TEKRA_SOAP_ENDPOINT no es una URL válida.')
  }

  if (endpoint.protocol !== 'https:') {
    throw new ErrorConfiguracionTekra(
      'TEKRA_SOAP_ENDPOINT debe utilizar HTTPS antes de enviar credenciales.',
    )
  }

  for (const campo of ['namespaceOperacion', 'soapAction']) {
    if (typeof configuracion[campo] !== 'string' || !configuracion[campo].trim()) {
      throw new ErrorConfiguracionTekra(`Falta la configuración ${campo}.`)
    }
  }

  for (const campo of CAMPOS_AUTENTICACION) {
    if (
      typeof configuracion.autenticacion?.[campo] !== 'string' ||
      !configuracion.autenticacion[campo].trim()
    ) {
      throw new ErrorConfiguracionTekra(
        `Falta el campo de autenticación TEKRA ${campo}.`,
      )
    }
  }

  if (configuracion.autenticacion.pn_validar_identificador !== 'SI') {
    throw new ErrorConfiguracionTekra(
      'pn_validar_identificador debe ser SI para preservar idempotencia.',
    )
  }

  return configuracion
}

export function construirSolicitudCertificacionSoap(configuracion, xmlDte) {
  const config = validarConfiguracion(configuracion)

  if (typeof xmlDte !== 'string' || !xmlDte.trim()) {
    throw new TypeError('Se requiere un XML DTE no vacío.')
  }

  const autenticacion = CAMPOS_AUTENTICACION.map(
    (campo) =>
      `        <${campo}>${escaparTextoXml(config.autenticacion[campo])}</${campo}>`,
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="${NAMESPACE_SOAP}">
  <soapenv:Header/>
  <soapenv:Body>
    <CertificacionDocumento xmlns="${escaparAtributoXml(config.namespaceOperacion)}">
      <Autenticacion>
${autenticacion}
      </Autenticacion>
      <Documento>${envolverCdata(xmlDte)}</Documento>
    </CertificacionDocumento>
  </soapenv:Body>
</soapenv:Envelope>`
}

const leerRespuestaLimitada = async (respuesta, maxBytes) => {
  const longitud = Number(respuesta.headers.get('content-length'))
  if (Number.isFinite(longitud) && longitud > maxBytes) {
    throw new Error('Respuesta demasiado grande')
  }

  if (!respuesta.body) return ''

  const lector = respuesta.body.getReader()
  const fragmentos = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await lector.read()
      if (done) break

      total += value.byteLength
      if (total > maxBytes) {
        await lector.cancel()
        throw new Error('Respuesta demasiado grande')
      }
      fragmentos.push(value)
    }
  } finally {
    lector.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let posicion = 0
  for (const fragmento of fragmentos) {
    bytes.set(fragmento, posicion)
    posicion += fragmento.byteLength
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function crearClienteSoapTekra(
  configuracion,
  { fetchImpl = globalThis.fetch } = {},
) {
  const config = validarConfiguracion(configuracion)

  if (typeof fetchImpl !== 'function') {
    throw new ErrorConfiguracionTekra('No existe un transporte HTTP disponible.')
  }

  return Object.freeze({
    async certificarDocumento(xmlDte, { signal } = {}) {
      const solicitud = construirSolicitudCertificacionSoap(config, xmlDte)
      const controlador = new AbortController()
      const cancelar = () => controlador.abort()
      signal?.addEventListener('abort', cancelar, { once: true })
      const temporizador = setTimeout(cancelar, config.timeoutMs)

      try {
        const respuesta = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: `"${config.soapAction}"`,
          },
          body: solicitud,
          signal: controlador.signal,
        })
        const xmlRespuesta = await leerRespuestaLimitada(
          respuesta,
          config.maxRespuestaBytes,
        )
        const resultado = parsearRespuestaCertificacionSoap(xmlRespuesta, {
          maxRespuestaBytes: config.maxRespuestaBytes,
          maxPdfBytes: config.maxPdfBytes,
          namespaceOperacion: config.namespaceOperacion,
        })

        return {
          ...resultado,
          httpStatus: respuesta.status,
        }
      } catch (error) {
        if (
          error?.name === 'ErrorRespuestaTekra' ||
          error?.name === 'AbortError' ||
          error instanceof TypeError ||
          error?.message === 'Respuesta demasiado grande'
        ) {
          throw new ErrorResultadoInciertoTekra(
            'No fue posible confirmar el resultado de la certificación.',
            error,
          )
        }

        if (error instanceof ErrorResultadoInciertoTekra) throw error

        throw new ErrorResultadoInciertoTekra(
          'No fue posible confirmar el resultado de la certificación.',
          error,
        )
      } finally {
        clearTimeout(temporizador)
        signal?.removeEventListener('abort', cancelar)
      }
    },
  })
}
