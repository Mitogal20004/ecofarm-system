import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorResultadoInciertoTekra } from '../../../src/integrations/tekra/errores.js'
import {
  finalizarResultadoConClaim,
  mapearResultadoInciertoParaFinalizacion,
  prepararYReclamarFacturaFel,
} from '../../../src/integrations/tekra/flujo-fel.js'

const FACTURA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const XML_PERSISTIDO = `
  <dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0">
    <dte:Adenda><DECertificador>${FACTURA_ID}</DECertificador></dte:Adenda>
  </dte:GTDocumento>`

test('un reintento reclama exactamente el XML persistido', async () => {
  let xmlReclamado = null
  const resultado = await prepararYReclamarFacturaFel({
    facturaId: FACTURA_ID,
    repositorio: {
      obtenerFacturaParaPreparacion: async () => ({
        factura: {
          id: FACTURA_ID,
          xml_solicitud: XML_PERSISTIDO,
          requiere_conciliacion: false,
        },
        venta: {},
        detalles: [],
      }),
    },
    generarXml: () => {
      throw new Error('No debe regenerarse un XML persistido')
    },
    reclamarFactura: async (_facturaId, xml) => {
      xmlReclamado = xml
      return { reclamada: true, factura: { id: FACTURA_ID } }
    },
  })

  assert.equal(resultado.reclamada, true)
  assert.equal(xmlReclamado, XML_PERSISTIDO)
})

test('un timeout se mapea a resultado_incierto para conciliación', () => {
  const finalizacion = mapearResultadoInciertoParaFinalizacion(
    new ErrorResultadoInciertoTekra('timeout simulado'),
  )

  assert.equal(finalizacion.tipo, 'resultado_incierto')
  assert.equal(finalizacion.respuesta_certificador.requiereConciliacion, true)
  assert.match(finalizacion.mensaje_error, /conciliación/i)
})

test('la finalización conserva el token exacto del claim', async () => {
  const token = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  let llamada = null

  await finalizarResultadoConClaim({
    facturaId: FACTURA_ID,
    tokenProcesamiento: token,
    resultado: new ErrorResultadoInciertoTekra('timeout simulado'),
    finalizarFactura: async (...argumentos) => {
      llamada = argumentos
      return { factura: { id: FACTURA_ID, estado: 'error' } }
    },
  })

  assert.equal(llamada[0], FACTURA_ID)
  assert.equal(llamada[1], token)
  assert.equal(llamada[2].tipo, 'resultado_incierto')
})
