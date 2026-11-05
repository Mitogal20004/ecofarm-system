// Documentos comerciales para demostración y salida en impresora térmica.
// No realiza escrituras en la API ni emite facturas FEL certificadas.
const anchoCaracteres = 40
const anchoPDF = 80 * 72 / 25.4
const moneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})
const fechaGuatemala = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
})

const texto = (valor, respaldo = '—') =>
  valor === null || valor === undefined || String(valor).trim() === ''
    ? respaldo
    : String(valor).trim()

const dinero = (valor) => {
  const numero = Number(valor)
  return Number.isFinite(numero) ? moneda.format(numero) : '—'
}

const fecha = (valor) => {
  if (!valor) return '—'
  const fechaValor = new Date(valor)
  return Number.isNaN(fechaValor.getTime())
    ? '—'
    : fechaGuatemala.format(fechaValor)
}

const normalizarArchivo = (valor) =>
  String(valor).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 65)

const nombreProducto = (linea) =>
  [linea.producto_nombre, linea.color, linea.longitud_cm ? String(linea.longitud_cm) + ' cm' : '']
    .filter(Boolean).join(' · ') || texto(linea.codigo_sku, 'Producto')

export function crearDocumentoVenta(detalle, tipo = 'recibo') {
  const { venta, recibo, detalles } = detalle ?? {}
  if (!venta || !Array.isArray(detalles)) {
    throw new Error('No se encontró el detalle de la venta.')
  }
  const factura = tipo === 'factura-demostracion'
  if (!factura && !recibo) {
    throw new Error('Primero debe emitirse el recibo de la venta.')
  }
  return {
    titulo: factura ? 'FACTURA DE PRUEBA' : 'RECIBO DE VENTA',
    numero: factura ? texto(venta.numero) : texto(recibo.numero),
    fecha: fecha(factura ? venta.fecha_confirmacion : (recibo.fecha_emision ?? venta.fecha_confirmacion)),
    serie: texto(recibo?.serie_usuario_snapshot ?? venta.serie_usuario_snapshot),
    cliente: texto(venta.comprador_nombre, 'Consumidor final'),
    nit: texto(venta.comprador_nit, 'CF'),
    direccion: texto(venta.comprador_direccion, ''),
    estado: texto(venta.estado, '').toUpperCase(),
    usuario: texto(venta.usuario_creador?.nombre_completo, ''),
    observaciones: texto(venta.observaciones, ''),
    productos: detalles.map((linea) => ({
      nombre: nombreProducto(linea),
      presentacion: texto(linea.presentacion_nombre, ''),
      cantidad: texto(linea.cantidad_presentaciones, '0'),
      precio: dinero(linea.precio_unitario),
      subtotal: dinero(linea.subtotal),
    })),
    subtotal: dinero(venta.subtotal),
    total: dinero(venta.total),
    recibido: factura ? null : (venta.monto_recibido == null ? null : dinero(venta.monto_recibido)),
    cambio: factura ? null : (venta.cambio == null ? null : dinero(venta.cambio)),
    aviso: factura
      ? 'DOCUMENTO DE PRUEBA - SIN VALIDEZ FISCAL. No es una factura FEL certificada.'
      : 'Comprobante de venta emitido por E-farm.',
  }
}

export function crearDocumentoCotizacion(detalle) {
  const { cotizacion, detalles } = detalle ?? {}
  if (!cotizacion || !Array.isArray(detalles)) {
    throw new Error('No se encontró el detalle de la cotización.')
  }
  return {
    titulo: 'COTIZACIÓN',
    numero: texto(cotizacion.numero),
    fecha: fecha(cotizacion.fecha_emision ?? cotizacion.fecha_creacion),
    serie: texto(cotizacion.serie_usuario_snapshot),
    cliente: texto(cotizacion.comprador_nombre, 'Consumidor final'),
    nit: texto(cotizacion.comprador_nit, 'CF'),
    direccion: texto(cotizacion.comprador_direccion, ''),
    estado: texto(cotizacion.estado, '').toUpperCase(),
    usuario: texto(cotizacion.usuario_creador?.nombre_completo, ''),
    observaciones: texto(cotizacion.observaciones, ''),
    productos: detalles.map((linea) => ({
      nombre: nombreProducto(linea),
      presentacion: texto(linea.presentacion_nombre, ''),
      cantidad: texto(linea.cantidad_presentaciones, '0'),
      precio: dinero(linea.precio_unitario),
      subtotal: dinero(linea.subtotal),
    })),
    subtotal: dinero(cotizacion.subtotal),
    total: dinero(cotizacion.total),
    recibido: null,
    cambio: null,
    aviso: 'Cotización comercial. No es una factura ni confirma una venta.',
  }
}

const cortarTexto = (valor, ancho = anchoCaracteres) => {
  const palabras = String(valor).replace(/\s+/g, ' ').trim().split(' ')
  const resultado = []
  let linea = ''
  for (const palabra of palabras) {
    if (!palabra) continue
    if ((linea + (linea ? ' ' : '') + palabra).length <= ancho) {
      linea += (linea ? ' ' : '') + palabra
      continue
    }
    if (linea) resultado.push(linea)
    linea = palabra
    while (linea.length > ancho) {
      resultado.push(linea.slice(0, ancho))
      linea = linea.slice(ancho)
    }
  }
  if (linea) resultado.push(linea)
  return resultado.length ? resultado : ['']
}

const agregarTexto = (lineas, valor, opciones = {}) => {
  for (const fragmento of cortarTexto(valor)) {
    lineas.push({ texto: fragmento, ...opciones })
  }
}

const agregarImporte = (lineas, etiqueta, importe, fuerte = false) => {
  const izquierda = texto(etiqueta, '')
  const derecha = texto(importe, '')
  const espacios = Math.max(1, anchoCaracteres - izquierda.length - derecha.length)
  lineas.push({ texto: izquierda + ' '.repeat(espacios) + derecha, negrita: fuerte })
}

export function construirLineasTicket(documento) {
  const lineas = []
  agregarTexto(lineas, 'E-FARM', { centro: true, negrita: true })
  agregarTexto(lineas, 'ECOFARM S.A.', { centro: true })
  agregarTexto(lineas, documento.titulo, { centro: true, negrita: true })
  lineas.push({ texto: '-'.repeat(anchoCaracteres) })
  agregarTexto(lineas, 'Número: ' + documento.numero)
  agregarTexto(lineas, 'Fecha: ' + documento.fecha)
  agregarTexto(lineas, 'Serie: ' + documento.serie)
  agregarTexto(lineas, 'Estado: ' + documento.estado)
  agregarTexto(lineas, 'Cliente: ' + documento.cliente)
  agregarTexto(lineas, 'NIT: ' + documento.nit)
  if (documento.direccion) agregarTexto(lineas, 'Dirección: ' + documento.direccion)
  if (documento.usuario) agregarTexto(lineas, 'Atendió: ' + documento.usuario)
  lineas.push({ texto: '-'.repeat(anchoCaracteres) })
  for (const producto of documento.productos) {
    agregarTexto(lineas, producto.nombre, { negrita: true })
    if (producto.presentacion) agregarTexto(lineas, producto.presentacion)
    agregarTexto(lineas, 'Cantidad: ' + producto.cantidad + '  Precio: ' + producto.precio)
    agregarImporte(lineas, 'Importe', producto.subtotal)
  }
  lineas.push({ texto: '-'.repeat(anchoCaracteres) })
  agregarImporte(lineas, 'Subtotal', documento.subtotal)
  agregarImporte(lineas, 'TOTAL', documento.total, true)
  if (documento.recibido !== null) agregarImporte(lineas, 'Recibido', documento.recibido)
  if (documento.cambio !== null) agregarImporte(lineas, 'Cambio', documento.cambio, true)
  if (documento.observaciones) {
    lineas.push({ texto: '-'.repeat(anchoCaracteres) })
    agregarTexto(lineas, 'Observaciones: ' + documento.observaciones)
  }
  lineas.push({ texto: '-'.repeat(anchoCaracteres) })
  agregarTexto(lineas, documento.aviso, { centro: true, negrita: true })
  agregarTexto(lineas, 'Gracias por su preferencia', { centro: true })
  return lineas
}

const escaparHTML = (valor) => String(valor).replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[caracter])

export function imprimirTicket(documento) {
  const ventana = window.open('', '_blank', 'width=420,height=760')
  if (!ventana) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para E-farm.')
  }
  const contenido = construirLineasTicket(documento)
    .map((linea) => linea.texto).join('\n')
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>' + escaparHTML(documento.titulo + ' ' + documento.numero) + '</title>' +
    '<style>@page{size:80mm 297mm;margin:0}*{box-sizing:border-box}' +
    'body{width:80mm;max-width:80mm;margin:0;padding:4mm;background:#fff;color:#000}' +
    'pre{width:72mm;margin:0;font:10px/1.45 "Courier New",monospace;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '@media screen{body{margin:auto;box-shadow:0 0 14px #ccc;min-height:300px}}</style>' +
    '</head><body><pre>' + escaparHTML(contenido) + '</pre></body></html>'
  ventana.document.open()
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  ventana.setTimeout(() => ventana.print(), 250)
}

// PDF de texto independiente de paquetes externos: tamaño variable de 80 mm.
// Se usa WinAnsi para preservar los caracteres habituales del español.
const caracteresEspeciales = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
])
const bytesWinAnsi = (cadena) => {
  const bytes = []
  for (const caracter of String(cadena)) {
    const codigo = caracter.codePointAt(0)
    bytes.push(codigo <= 255 ? codigo : (caracteresEspeciales.get(codigo) ?? 63))
  }
  return bytes
}
const escaparPDF = (valor) => String(valor)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[\r\n]/g, ' ')

export function generarPDFTicket(documento) {
  const lineas = construirLineasTicket(documento)
  const porPagina = 92
  const paginas = []
  for (let i = 0; i < lineas.length; i += porPagina) {
    paginas.push(lineas.slice(i, i + porPagina))
  }
  const totalPaginas = Math.max(paginas.length, 1)
  const idsPaginas = Array.from({ length: totalPaginas }, (_, i) => 5 + i * 2)
  const objetos = new Map()
  objetos.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objetos.set(2, '<< /Type /Pages /Count ' + totalPaginas +
    ' /Kids [' + idsPaginas.map((id) => id + ' 0 R').join(' ') + '] >>')
  objetos.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')
  objetos.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>')
  for (let i = 0; i < totalPaginas; i += 1) {
    const grupos = paginas[i] ?? []
    const alto = Math.max(160, 40 + grupos.length * 11)
    const paginaId = idsPaginas[i]
    const contenidoId = paginaId + 1
    const comandos = grupos.map((linea, indice) => {
      const fuente = linea.negrita ? 'F2' : 'F1'
      const anchoTexto = linea.texto.length * 4.8
      const x = linea.centro ? Math.max(12, (anchoPDF - anchoTexto) / 2) : 14
      const y = alto - 22 - indice * 11
      return 'BT /' + fuente + ' 8 Tf 1 0 0 1 ' + x.toFixed(2) + ' ' +
        y.toFixed(2) + ' Tm (' + escaparPDF(linea.texto) + ') Tj ET'
    }).join('\n')
    objetos.set(paginaId, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      anchoPDF.toFixed(2) + ' ' + alto + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>' +
      ' /Contents ' + contenidoId + ' 0 R >>')
    objetos.set(contenidoId, '<< /Length ' + bytesWinAnsi(comandos).length +
      ' >>\nstream\n' + comandos + '\nendstream')
  }

  const salida = []
  const agregar = (valor) => salida.push(...bytesWinAnsi(valor))
  agregar('%PDF-1.4\n%âãÏÓ\n')
  const offsets = [0]
  const totalObjetos = 4 + totalPaginas * 2
  for (let id = 1; id <= totalObjetos; id += 1) {
    offsets[id] = salida.length
    agregar(id + ' 0 obj\n' + objetos.get(id) + '\nendobj\n')
  }
  const xref = salida.length
  agregar('xref\n0 ' + (totalObjetos + 1) + '\n0000000000 65535 f \n')
  for (let id = 1; id <= totalObjetos; id += 1) {
    agregar(String(offsets[id]).padStart(10, '0') + ' 00000 n \n')
  }
  agregar('trailer\n<< /Size ' + (totalObjetos + 1) +
    ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n')
  return new Blob([Uint8Array.from(salida)], { type: 'application/pdf' })
}


/**
 * Abre el PDF de ticket de 80 mm en el visor nativo del navegador.
 * No genera una nueva venta ni modifica registros del servidor.
 */
export function verPDFTicket(documento) {
  const ventana = window.open('', '_blank')
  if (!ventana) {
    throw new Error('El navegador bloqueó la vista previa. Permite ventanas emergentes para E-farm.')
  }

  try {
    const url = URL.createObjectURL(generarPDFTicket(documento))
    ventana.location.replace(url)
    // Tiempo suficiente para que el usuario pueda ver, imprimir o guardar el PDF.
    window.setTimeout(() => URL.revokeObjectURL(url), 600000)
  } catch (error) {
    ventana.close()
    throw error
  }
}

export function descargarPDFTicket(documento) {
  const pdf = generarPDFTicket(documento)
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(pdf)
  enlace.href = url
  enlace.download = normalizarArchivo(documento.titulo + '-' + documento.numero) + '.pdf'
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
