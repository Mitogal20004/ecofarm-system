import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorRespuestaTekra } from '../../../src/integrations/tekra/errores.js'
import { parsearRespuestaCertificacionSoap } from '../../../src/integrations/tekra/respuesta-soap.js'

const UUID_FEL = '11111111-2222-4333-8444-555555555555'
const xmlCertificado = `<?xml version="1.0"?>
<dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0">
  <dte:SAT>
    <dte:DTE>
      <dte:Certificacion>
        <dte:NumeroAutorizacion Serie="ABC" Numero="12345">${UUID_FEL}</dte:NumeroAutorizacion>
        <dte:FechaHoraCertificacion>2026-10-14T11:00:00-06:00</dte:FechaHoraCertificacion>
      </dte:Certificacion>
    </dte:DTE>
  </dte:SAT>
</dte:GTDocumento>`
const pdfBase64 = Buffer.from('%PDF-1.4\ncontenido simulado').toString('base64')

const sobreResultado = ({ resultado, certificado = '', pdf = '' }) => `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tek="https://contrato.example.invalid/tekra">
  <soap:Body>
    <tek:CertificacionDocumentoResponse>
      <ResultadoCertificacion><![CDATA[${JSON.stringify(resultado)}]]></ResultadoCertificacion>
      <DocumentoCertificado>${certificado}</DocumentoCertificado>
      <RepresentacionGrafica>${pdf}</RepresentacionGrafica>
    </tek:CertificacionDocumentoResponse>
  </soap:Body>
</soap:Envelope>`

test('extrae certificado y PDF Base64 válidos', () => {
  const resultado = parsearRespuestaCertificacionSoap(
    sobreResultado({
      resultado: {
        error: 0,
        frases: [{ tipo: 'referencia' }],
        mensajes_marcas: ['Aviso SAT de prueba'],
        errores_xsd: null,
      },
      certificado: xmlCertificado,
      pdf: pdfBase64,
    }),
    { namespaceOperacion: 'https://contrato.example.invalid/tekra' },
  )

  assert.equal(resultado.tipo, 'certificada')
  assert.equal(resultado.uuidFel, UUID_FEL)
  assert.equal(resultado.serieFel, 'ABC')
  assert.equal(resultado.numeroFel, '12345')
  assert.ok(Buffer.isBuffer(resultado.pdf))
  assert.equal(resultado.xmlCertificado, xmlCertificado)
  assert.equal(resultado.pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(resultado.respuestaCertificador.representacionGraficaRecibida, true)
  assert.deepEqual(resultado.respuestaCertificador.frases, [
    { tipo: 'referencia' },
  ])
  assert.deepEqual(resultado.respuestaCertificador.mensajes_marcas, [
    'Aviso SAT de prueba',
  ])
  assert.equal('RepresentacionGrafica' in resultado.respuestaCertificador, false)
})

test('clasifica un rechazo documentado por TEKRA', () => {
  const resultado = parsearRespuestaCertificacionSoap(
    sobreResultado({
      resultado: {
        error: 1,
        errores_xsd: [{ mensaje: 'Documento rechazado por el mock' }],
      },
    }),
  )

  assert.equal(resultado.tipo, 'rechazada')
  assert.equal(resultado.mensaje, 'Documento rechazado por el mock')
})

test('reconoce SOAP Fault sin interpretar entidades externas', () => {
  const soap = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <soap:Fault>
          <faultcode>soap:Client</faultcode>
          <faultstring>Solicitud inválida de prueba</faultstring>
        </soap:Fault>
      </soap:Body>
    </soap:Envelope>`
  const resultado = parsearRespuestaCertificacionSoap(soap)

  assert.equal(resultado.tipo, 'soap_fault')
  assert.equal(resultado.codigo, 'soap:Client')
  assert.equal(resultado.mensaje, 'Solicitud inválida de prueba')

  assert.throws(
    () =>
      parsearRespuestaCertificacionSoap(
        '<!DOCTYPE x [<!ENTITY archivo SYSTEM "file:///etc/passwd">]><x/>',
      ),
    ErrorRespuestaTekra,
  )
})

test('rechaza Base64 inválido o contenido que no sea PDF', () => {
  assert.throws(
    () =>
      parsearRespuestaCertificacionSoap(
        sobreResultado({
          resultado: { error: 0 },
          certificado: xmlCertificado,
          pdf: '***no-base64***',
        }),
      ),
    /Base64 válido/i,
  )

  assert.throws(
    () =>
      parsearRespuestaCertificacionSoap(
        sobreResultado({
          resultado: { error: 0 },
          certificado: xmlCertificado,
          pdf: Buffer.from('no es pdf').toString('base64'),
        }),
      ),
    /no contiene un PDF/i,
  )
})

test('exige la semántica documentada error entero igual a cero', () => {
  assert.throws(
    () =>
      parsearRespuestaCertificacionSoap(
        sobreResultado({
          resultado: { error: false },
          certificado: xmlCertificado,
          pdf: pdfBase64,
        }),
      ),
    /código error entero/i,
  )
})
