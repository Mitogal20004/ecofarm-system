import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorResultadoInciertoTekra } from '../../../src/integrations/tekra/errores.js'
import {
  finalizarResultadoConClaim,
  mapearResultadoInciertoParaFinalizacion,
  prepararYReclamarFacturaFel,
} from '../../../src/integrations/tekra/flujo-fel.js'

const FACTURA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VENTA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const XML_PERSISTIDO = `
  <dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0">
    <dte:SAT>
      <dte:DTE>
        <dte:DatosEmision>
          <dte:DatosGenerales Tipo="FACT"/>
          <dte:Receptor IDReceptor="CF" NombreReceptor="Comprador persistido"/>
          <dte:Totales><dte:GranTotal>100.00</dte:GranTotal></dte:Totales>
        </dte:DatosEmision>
      </dte:DTE>
      <dte:Adenda><DECertificador>${FACTURA_ID}</DECertificador></dte:Adenda>
    </dte:SAT>
  </dte:GTDocumento>`

const crearDatosPersistidos = () => ({
  factura: {
    id: FACTURA_ID,
    venta_id: VENTA_ID,
    estado: 'error',
    tipo_documento: 'FACT',
    nit_receptor_snapshot: 'CF',
    nombre_receptor_snapshot: 'Comprador persistido',
    direccion_receptor_snapshot: 'Dirección persistida',
    total_snapshot: '100.00',
    xml_solicitud: XML_PERSISTIDO,
    requiere_conciliacion: false,
  },
  venta: {
    id: VENTA_ID,
    estado: 'confirmada',
    comprador_nit: 'CF',
    comprador_nombre: 'Comprador persistido',
    comprador_direccion: 'Dirección persistida',
    subtotal: '100.00',
    total: '100.00',
    fecha_confirmacion: '2026-10-14T10:30:00-06:00',
  },
  detalles: [
    {
      venta_id: VENTA_ID,
      numero_linea: 1,
      producto_nombre_snapshot: 'Snapdragon',
      presentacion_nombre_snapshot: 'Caja 10',
      codigo_sku_snapshot: 'SNAP-ROJO-60',
      cantidad_presentaciones: 2,
      precio_unitario: '50.00',
      subtotal: '100.00',
    },
  ],
})

test('un reintento reclama exactamente el XML persistido', async () => {
  let xmlReclamado = null
  const resultado = await prepararYReclamarFacturaFel({
    facturaId: FACTURA_ID,
    repositorio: {
      obtenerFacturaParaPreparacion: async () => crearDatosPersistidos(),
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

test('rechaza un XML persistido que no coincide con los snapshots', async () => {
  const datos = crearDatosPersistidos()
  datos.factura.xml_solicitud = XML_PERSISTIDO.replace(
    'NombreReceptor="Comprador persistido"',
    'NombreReceptor="Comprador diferente"',
  )

  await assert.rejects(
    prepararYReclamarFacturaFel({
      facturaId: FACTURA_ID,
      repositorio: {
        obtenerFacturaParaPreparacion: async () => datos,
      },
      generarXml: () => {
        throw new Error('No debe regenerarse un XML persistido')
      },
      reclamarFactura: async () => {
        throw new Error('No debe reclamar un XML inconsistente')
      },
    }),
    /XML persistido no corresponde/i,
  )
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
