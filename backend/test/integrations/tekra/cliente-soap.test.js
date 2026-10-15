import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ErrorConfiguracionTekra,
  ErrorResultadoInciertoTekra,
} from '../../../src/integrations/tekra/errores.js'
import {
  construirSolicitudCertificacionSoap,
  crearClienteSoapTekra,
} from '../../../src/integrations/tekra/cliente-soap.js'

const configuracion = {
  endpoint: 'https://tekra.example.invalid/servicio',
  namespaceOperacion: 'https://contrato.example.invalid/tekra',
  soapAction: 'CertificacionDocumento',
  timeoutMs: 10,
  maxRespuestaBytes: 1024 * 1024,
  maxPdfBytes: 1024 * 1024,
  autenticacion: {
    pn_usuario: 'usuario-mock',
    pn_clave: 'clave-mock',
    pn_cliente: 'cliente-mock',
    pn_contrato: 'contrato-mock',
    pn_id_origen: 'origen-mock',
    pn_ip_origen: '127.0.0.1',
    pn_firmar_emisor: 'SI',
    pn_validar_identificador: 'SI',
  },
}

test('construye SOAP 1.1 con autenticación y DTE en CDATA', () => {
  const dte = '<dte:GTDocumento><DECertificador>id]]>estable</DECertificador></dte:GTDocumento>'
  const solicitud = construirSolicitudCertificacionSoap(configuracion, dte)

  assert.match(solicitud, /schemas\.xmlsoap\.org\/soap\/envelope/)
  assert.match(
    solicitud,
    /<CertificacionDocumento xmlns="https:\/\/contrato\.example\.invalid\/tekra">/,
  )
  assert.match(solicitud, /<pn_validar_identificador>SI<\/pn_validar_identificador>/)
  assert.match(solicitud, /<!\[CDATA\[/)
  assert.match(solicitud, /\]\]\]\]><!\[CDATA\[>/)
})

test('bloquea endpoints HTTP aunque el manual muestre uno sin TLS', () => {
  assert.throws(
    () =>
      crearClienteSoapTekra({
        ...configuracion,
        endpoint: 'http://tekra.example.invalid/servicio',
      }),
    ErrorConfiguracionTekra,
  )
})

test('procesa una certificación usando exclusivamente transporte mock', async () => {
  const uuid = '11111111-2222-4333-8444-555555555555'
  const certificado = `<dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0">
    <dte:NumeroAutorizacion Serie="A" Numero="1">${uuid}</dte:NumeroAutorizacion>
    <FechaHoraCertificacion>2026-10-14T11:00:00-06:00</FechaHoraCertificacion>
  </dte:GTDocumento>`
  const resultadoJson = JSON.stringify({
    error: 0,
    frases: [],
    mensajes_marcas: [],
    errores_xsd: null,
  })
  const pdf = Buffer.from('%PDF-1.4\nmock').toString('base64')
  let solicitud = null
  const fetchMock = async (url, opciones) => {
    solicitud = { url, opciones }
    return new Response(
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tek="${configuracion.namespaceOperacion}">
        <soap:Body>
          <tek:CertificacionDocumentoResponse>
            <ResultadoCertificacion><![CDATA[${resultadoJson}]]></ResultadoCertificacion>
            <DocumentoCertificado>${certificado}</DocumentoCertificado>
            <RepresentacionGrafica>${pdf}</RepresentacionGrafica>
          </tek:CertificacionDocumentoResponse>
        </soap:Body>
      </soap:Envelope>`,
      { status: 200, headers: { 'Content-Type': 'text/xml' } },
    )
  }
  const cliente = crearClienteSoapTekra(configuracion, { fetchImpl: fetchMock })
  const resultado = await cliente.certificarDocumento('<dte:GTDocumento/>')

  assert.equal(resultado.tipo, 'certificada')
  assert.equal(resultado.uuidFel, uuid)
  assert.equal(solicitud.url, configuracion.endpoint)
  assert.equal(solicitud.opciones.method, 'POST')
  assert.equal(solicitud.opciones.headers.SOAPAction, '"CertificacionDocumento"')
  assert.match(solicitud.opciones.body, /<Documento><!\[CDATA\[/)
})

test('clasifica timeout o error de red como resultado incierto', async () => {
  const fetchConTimeout = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          const error = new Error('timeout simulado')
          error.name = 'AbortError'
          reject(error)
        },
        { once: true },
      )
    })
  const cliente = crearClienteSoapTekra(configuracion, {
    fetchImpl: fetchConTimeout,
  })

  await assert.rejects(
    cliente.certificarDocumento('<dte:GTDocumento/>'),
    ErrorResultadoInciertoTekra,
  )
})
