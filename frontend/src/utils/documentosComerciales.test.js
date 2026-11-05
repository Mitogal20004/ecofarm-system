import test from 'node:test'
import assert from 'node:assert/strict'
import {
  crearDocumentoVenta,
  crearDocumentoCotizacion,
  construirLineasTicket,
  generarPDFTicket,
} from './documentosComerciales.js'

const venta = {
  venta: {
    numero: 'VTA-10',
    estado: 'confirmada',
    fecha_confirmacion: '2026-11-03T20:00:00Z',
    comprador_nombre: 'María López',
    comprador_nit: 'CF',
    subtotal: '36.50',
    total: '36.50',
    monto_recibido: '40.00',
    cambio: '3.50',
  },
  recibo: { numero: 'REC-10', serie_usuario_snapshot: 'A' },
  detalles: [{
    producto_nombre: 'Flores',
    color: 'Rosado',
    presentacion_nombre: 'Manojo',
    cantidad_presentaciones: 2,
    precio_unitario: '18.25',
    subtotal: '36.50',
  }],
}
const cotizacion = {
  cotizacion: {
    numero: 'COT-10',
    estado: 'emitida',
    fecha_creacion: '2026-11-03T20:00:00Z',
    comprador_nombre: 'Cliente de prueba',
    comprador_nit: 'CF',
    subtotal: '36.50',
    total: '36.50',
  },
  detalles: venta.detalles,
}

test('recibo refleja pago y cambio originales sin mutar la venta', () => {
  const original = structuredClone(venta)
  const documento = crearDocumentoVenta(venta)
  const texto = construirLineasTicket(documento).map((item) => item.texto).join('\n')
  assert.match(texto, /REC-10/)
  assert.match(texto, /María López/)
  assert.match(texto, /Cambio/)
  assert.match(texto, /3\.50/)
  assert.deepEqual(venta, original)
})

test('factura de prueba no se presenta como FEL ni duplica cobros', () => {
  const documento = crearDocumentoVenta(venta, 'factura-demostracion')
  assert.match(documento.aviso, /SIN VALIDEZ FISCAL/)
  assert.match(documento.aviso, /No es una factura FEL certificada/)
  assert.equal(documento.recibido, null)
  assert.equal(documento.cambio, null)
})

test('sin recibo no se permite producir comprobante tipo recibo', () => {
  assert.throws(() => crearDocumentoVenta({ ...venta, recibo: null }), /emitirse el recibo/)
})

test('cotización no confirma ventas ni se confunde con factura', () => {
  const documento = crearDocumentoCotizacion(cotizacion)
  assert.match(documento.aviso, /No es una factura/)
  assert.equal(documento.numero, 'COT-10')
  assert.equal(documento.recibido, null)
})

test('PDF es un documento PDF descargable con texto español', async () => {
  const pdf = generarPDFTicket(crearDocumentoVenta(venta))
  assert.equal(pdf.type, 'application/pdf')
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  assert.deepEqual(Array.from(bytes.slice(0, 5)), Array.from(new TextEncoder().encode('%PDF-')))
  assert.ok(bytes.byteLength > 800)
})

test('números extensos no bloquean el formato ticket', () => {
  const documento = crearDocumentoVenta({
    ...venta,
    venta: { ...venta.venta, comprador_nombre: 'Comercializadora Agrícola de Flores y Semillas Internacionales' },
  })
  const lineas = construirLineasTicket(documento)
  assert.ok(lineas.length > 10)
  assert.ok(lineas.every((linea) => linea.texto.length <= 80))
})


test('ticket PDF usa ancho de impresora térmica de 80 mm', async () => {
  const pdf = generarPDFTicket(crearDocumentoVenta(venta))
  const contenido = new TextDecoder('latin1').decode(await pdf.arrayBuffer())
  assert.match(contenido, /\/MediaBox \[0 0 226\.77 /)
})

test('factura de demostración imprime aviso fiscal visible', () => {
  const documento = crearDocumentoVenta(venta, 'factura-demostracion')
  const contenido = construirLineasTicket(documento).map((linea) => linea.texto).join('\n')
  assert.match(contenido, /DOCUMENTO DE PRUEBA/)
  assert.match(contenido, /SIN VALIDEZ\s+FISCAL/)
})

test('PDF de ticket largo reparte páginas sin truncar la venta', async () => {
  const larga = {
    ...venta,
    detalles: Array.from({ length: 110 }, (_, indice) => ({
      ...venta.detalles[0],
      producto_nombre: 'Flores número ' + (indice + 1),
    })),
  }
  const pdf = generarPDFTicket(crearDocumentoVenta(larga))
  const contenido = new TextDecoder('latin1').decode(await pdf.arrayBuffer())
  assert.match(contenido, /\/Type \/Pages \/Count [2-9]/)
})


test('los tres tickets usan TOTAL unico sin Importe ni Subtotal', () => {
  const casos = [
    crearDocumentoVenta(venta, 'recibo'),
    crearDocumentoVenta(venta, 'factura-demostracion'),
    crearDocumentoCotizacion(cotizacion),
  ]
  for (const documento of casos) {
    const lineas = construirLineasTicket(documento)
    const totales = lineas.filter((linea) => linea.tipo === 'total')
    assert.equal(totales.length, 1)
    assert.equal(totales[0].etiqueta, 'TOTAL')
    assert.equal(totales[0].negrita, true)
    assert.ok(lineas.every((linea) => !/^(?:Importe|Subtotal)\b/i.test(linea.texto)))
    assert.ok(lineas.some((linea) => linea.tipo === 'marca'))
    assert.ok(lineas.some((linea) => linea.tipo === 'titulo'))
  }
})

test('impresion termica incluye logo monocromo y TOTAL grande', async () => {
  const { imprimirTicket } = await import('./documentosComerciales.js')
  const previo = globalThis.window
  let pagina = ''
  let impresiones = 0
  let logoOcultoEnTexto = false
  const ventana = {
    closed: false,
    document: {
      open() {},
      write(texto) { pagina = texto },
      close() {},
      getElementById() { return { complete: true, naturalWidth: 200 } },
      querySelector() {
        return { classList: { add(nombre) { if (nombre === 'con-logo') logoOcultoEnTexto = true } } }
      },
    },
    focus() {},
    setTimeout(cb) { cb() },
    print() { impresiones += 1 },
  }
  globalThis.window = { open() { return ventana } }
  try {
    imprimirTicket(crearDocumentoVenta(venta), '/assets/logo-efarm.png')
  } finally {
    if (previo === undefined) delete globalThis.window
    else globalThis.window = previo
  }
  assert.equal(impresiones, 1)
  assert.equal(logoOcultoEnTexto, true)
  assert.match(pagina, /logo-ticket-efarm/)
  assert.match(pagina, /grayscale\(1\) contrast\(6\)/)
  assert.match(pagina, /importe-ticket total/)
  assert.match(pagina, /font-size:15px;font-weight:900/)
  assert.doesNotMatch(pagina, /class="importe-ticket importe"/)
})

test('en la cotizacion no se imprimen recibido ni cambio', () => {
  const documento = crearDocumentoCotizacion(cotizacion)
  const lineas = construirLineasTicket(documento)
  assert.equal(lineas.filter((linea) => linea.tipo === 'total').length, 1)
  assert.ok(!lineas.some((linea) => ['recibido', 'cambio'].includes(linea.tipo)))
})
