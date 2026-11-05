import test from 'node:test'
import assert from 'node:assert/strict'
import { generarPDFFormal } from './documentosFormales.js'
import {
  crearDocumentoVenta,
  crearDocumentoCotizacion,
} from './documentosComerciales.js'

const detalleVenta = {
  venta: {
    numero: 'VTA-001',
    estado: 'confirmada',
    fecha_confirmacion: '2026-11-04T20:00:00Z',
    comprador_nombre: 'Distribuidora de Flores, S.A.',
    comprador_nit: '1234567-8',
    comprador_direccion: 'Antigua Guatemala',
    tipo_comprador: 'registrado',
    serie_usuario_snapshot: 'V01',
    total: '120.00',
    subtotal: '120.00',
    monto_recibido: '150.00',
    cambio: '30.00',
    observaciones: 'Entrega en la mañana.',
  },
  recibo: { numero: 'REC-001', serie_usuario_snapshot: 'V01' },
  detalles: [{
    codigo_sku: 'SNAP-MOR-60',
    producto_nombre: 'Snapdragon',
    color: 'Morado',
    longitud_cm: 60,
    clasificacion: 'normal',
    presentacion_nombre: 'Manojo',
    cantidad_presentaciones: 2,
    cantidad_manojos: 2,
    cantidad_manojos_presentacion: 1,
    precio_unitario: '60.00',
    subtotal: '120.00',
  }],
}

const detalleCotizacion = {
  cotizacion: {
    numero: 'COT-001',
    estado: 'emitida',
    fecha_creacion: '2026-11-04T20:00:00Z',
    comprador_nombre: 'Cliente de prueba',
    comprador_nit: 'CF',
    serie_usuario_snapshot: 'V01',
    subtotal: '120.00',
    total: '120.00',
  },
  detalles: detalleVenta.detalles,
}

const contenidoPdf = async (documento) => {
  const pdf = await generarPDFFormal(documento)
  assert.equal(pdf.type, 'application/pdf')
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  assert.deepEqual(Array.from(bytes.slice(0, 5)), Array.from(new TextEncoder().encode('%PDF-')))
  assert.ok(bytes.length > 1500)
  return new TextDecoder('latin1').decode(bytes)
}

test('recibo PDF tiene formato carta y datos comerciales', async () => {
  const d = crearDocumentoVenta(detalleVenta, 'recibo')
  const contenido = await contenidoPdf(d)
  assert.match(contenido, /MediaBox \[0 0 612 792\]/)
  assert.match(contenido, /RECIBO/)
  assert.match(contenido, /REC-001/)
  assert.match(contenido, /COMPRADOR/)
  assert.match(contenido, /Snapdragon/)
  assert.match(contenido, /CAMBIO/)
  assert.match(contenido, /150\.00/)
})

test('factura de prueba PDF lleva aviso de no validez fiscal', async () => {
  const d = crearDocumentoVenta(detalleVenta, 'factura-demostracion')
  const contenido = await contenidoPdf(d)
  assert.match(contenido, /FACTURA DE DEMOSTRACI/)
  assert.match(contenido, /SIN VALIDEZ FISCAL/)
  assert.match(contenido, /FEL certificada/)
  assert.match(contenido, /RECIBIDO/)
})

test('cotización PDF no muestra cobro ni simula factura', async () => {
  const d = crearDocumentoCotizacion(detalleCotizacion)
  const contenido = await contenidoPdf(d)
  assert.match(contenido, /COTIZACI/)
  assert.match(contenido, /COT-001/)
  assert.doesNotMatch(contenido, /RECIBIDO/)
  assert.doesNotMatch(contenido, /FACTURA DE DEMOSTRACI/)
})

test('PDF formal divide documentos largos en varias páginas', async () => {
  const largo = {
    ...detalleCotizacion,
    detalles: Array.from({ length: 100 }, (_, i) => ({
      ...detalleCotizacion.detalles[0],
      codigo_sku: 'SKU-' + i,
      producto_nombre: 'Producto ' + i,
    })),
  }
  const contenido = await contenidoPdf(crearDocumentoCotizacion(largo))
  assert.match(contenido, /\/Type \/Pages \/Count [2-9][0-9]*/)
  assert.match(contenido, /SKU-99/)
})
