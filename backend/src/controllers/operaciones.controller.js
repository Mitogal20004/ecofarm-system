import {
  ErrorServicioOperaciones,
  crearCompra as crearCompraServicio,
  crearDespacho as crearDespachoServicio,
  crearInsumo as crearInsumoServicio,
  crearLote as crearLoteServicio,
  crearPedido as crearPedidoServicio,
  crearProveedor as crearProveedorServicio,
  eliminarProveedor as eliminarProveedorServicio,
  eliminarInsumo as eliminarInsumoServicio,
  actualizarProveedor as actualizarProveedorServicio,
  actualizarInsumo as actualizarInsumoServicio,
  listarCompras as listarComprasServicio,
  listarDespachos as listarDespachosServicio,
  listarInsumos as listarInsumosServicio,
  listarLotes as listarLotesServicio,
  listarPedidos as listarPedidosServicio,
  listarProveedores as listarProveedoresServicio,
  registrarCalidad as registrarCalidadServicio,
  generarQrLote as generarQrLoteServicio,
  recibirCompra as recibirCompraServicio,
  reservarPedidoFifo as reservarPedidoFifoServicio,
  listarOrdenesEmpaque as listarOrdenesEmpaqueServicio,
  crearOrdenEmpaque as crearOrdenEmpaqueServicio,
  actualizarOrdenEmpaque as actualizarOrdenEmpaqueServicio,
  liberarReserva as liberarReservaServicio,
  consumirReserva as consumirReservaServicio,
  listarReservas as listarReservasServicio,
  crearCompraDetalle as crearCompraDetalleServicio,
  crearPedidoDetalle as crearPedidoDetalleServicio,
  actualizarDespacho as actualizarDespachoServicio,
  listarMermas as listarMermasServicio,
  registrarMermaOperativa as registrarMermaOperativaServicio,
} from '../services/operaciones.service.js'
import { emitirAlertasStockBajoSinBloquear } from '../services/alertas.service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CAMPOS_PROVEEDOR = ['nombre', 'nit', 'contacto', 'telefono', 'correo']
const CAMPOS_INSUMO = ['codigo', 'nombre', 'categoria', 'unidad_medida', 'costo_referencia', 'stock_actual', 'stock_minimo']

const objeto = (valor) => valor && typeof valor === 'object' && !Array.isArray(valor)
const texto = (valor, max = 200) => typeof valor === 'string' && valor.trim() !== '' && valor.trim().length <= max
const uuid = (valor) => typeof valor === 'string' && UUID.test(valor)
const entero = (valor, minimo = 0) => Number.isSafeInteger(valor) && valor >= minimo

function exigirObjeto(body, campos) {
  if (!objeto(body) || Object.keys(body).some((campo) => !campos.includes(campo))) throw new Error('Solicitud inválida')
}

function normalizarProveedor(body, parcial = false) {
  exigirObjeto(body, CAMPOS_PROVEEDOR)
  if (!parcial && !texto(body.nombre, 200)) throw new Error('Solicitud inválida')
  if (parcial && !Object.keys(body).length) throw new Error('Solicitud inválida')

  const datos = {}
  if (Object.hasOwn(body, 'nombre')) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : body.nombre
    if (!texto(nombre, 200)) throw new Error('Solicitud inválida')
    datos.nombre = nombre
  }
  if (Object.hasOwn(body, 'nit')) {
    const nit = typeof body.nit === 'string' ? body.nit.trim() : body.nit
    if (nit !== null && nit !== undefined && (!texto(nit, 30) || !/^\d+(?:-\d)?$/.test(nit))) throw new Error('Solicitud inválida')
    datos.nit = nit || null
  }
  if (Object.hasOwn(body, 'contacto')) {
    const contacto = typeof body.contacto === 'string' ? body.contacto.trim() : body.contacto
    if (contacto !== null && contacto !== undefined && (!texto(contacto, 150) || !/^[\p{L}\s.'-]+$/u.test(contacto))) throw new Error('Solicitud inválida')
    datos.contacto = contacto || null
  }
  if (Object.hasOwn(body, 'telefono')) {
    const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : body.telefono
    if (telefono !== null && telefono !== undefined && (!texto(telefono, 20) || !/^\+?\d{7,15}$/.test(telefono))) throw new Error('Solicitud inválida')
    datos.telefono = telefono || null
  }
  if (Object.hasOwn(body, 'correo')) {
    const correo = typeof body.correo === 'string' ? body.correo.trim() : body.correo
    if (correo !== null && correo !== undefined && (!texto(correo, 254) || !EMAIL.test(correo))) throw new Error('Solicitud inválida')
    datos.correo = correo?.toLowerCase() || null
  }
  return datos
}

function responderError(res, error) {
  if (error instanceof ErrorServicioOperaciones) {
    console.error('Error de operaciones en Supabase', {
      codigo: error.codigo,
      mensaje: error.cause?.message,
    })
  }

  if (error instanceof Error && error.message === 'Solicitud inválida') return res.status(400).json({ ok: false, message: error.message })
  if (error instanceof ErrorServicioOperaciones && error.codigo === '23505') {
    if (error.restriccion === 'proveedores_nit_unico') return res.status(409).json({ ok: false, message: 'Ya existe un proveedor con ese NIT.' })
    if (error.restriccion === 'proveedores_contacto_unico') return res.status(409).json({ ok: false, message: 'Ya existe un proveedor con esa persona de contacto.' })
    return res.status(409).json({ ok: false, message: 'El registro ya existe.' })
  }
  if (error instanceof ErrorServicioOperaciones && error.codigo === '23514') return res.status(400).json({ ok: false, message: 'Los datos no cumplen las reglas del sistema.' })
  if (error instanceof ErrorServicioOperaciones && error.codigo === '23503') return res.status(400).json({ ok: false, message: 'La referencia indicada no existe.' })
  return res.status(500).json({ ok: false, message: 'No fue posible completar la operación.' })
}

export async function listarLotes(req, res) { try { return res.json({ lotes: await listarLotesServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearLote(req, res) {
  try {
    exigirObjeto(req.body, ['codigo', 'origen', 'proveedor_id', 'variante_id', 'fecha_origen', 'fecha_recepcion', 'fecha_vencimiento', 'variedad', 'color', 'longitud_cm', 'calidad', 'cantidad_inicial', 'cantidad_disponible', 'costo_unitario', 'estado', 'observaciones'])
    const b = req.body
    if (!texto(b.codigo, 50) || !['compra', 'produccion'].includes(b.origen) || !texto(b.variedad, 120) || !texto(b.color, 80) || !entero(b.longitud_cm, 1) || !entero(b.cantidad_inicial, 1) || !entero(b.cantidad_disponible, 0) || b.cantidad_disponible > b.cantidad_inicial || typeof b.fecha_origen !== 'string') throw new Error('Solicitud inválida')
    const lote = await crearLoteServicio({ ...b, creado_por: req.usuario.id, codigo: b.codigo.trim().toUpperCase() })
    return res.status(201).json({ lote })
  } catch (e) { return responderError(res, e) }
}

export async function listarInsumos(req, res) { try { return res.json({ insumos: await listarInsumosServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearInsumo(req, res) {
  try {
    exigirObjeto(req.body, CAMPOS_INSUMO)
    const b = req.body
    if (!texto(b.codigo, 40) || !texto(b.nombre, 150) || !texto(b.categoria, 50) || !texto(b.unidad_medida, 20) || typeof b.costo_referencia !== 'number' || b.costo_referencia < 0 || typeof b.stock_actual !== 'number' || b.stock_actual < 0 || typeof b.stock_minimo !== 'number' || b.stock_minimo < 0) throw new Error('Solicitud inválida')
    const insumo = await crearInsumoServicio({ ...b, codigo: b.codigo.trim().toUpperCase() })
    emitirAlertasStockBajoSinBloquear()
    return res.status(201).json({ insumo })
  } catch (e) { return responderError(res, e) }
}

export async function actualizarInsumo(req, res) {
  try {
    if (!uuid(req.params.insumoId) || !objeto(req.body) || typeof req.body.activo !== 'boolean') throw new Error('Solicitud inválida')
    return res.json({ insumo: await actualizarInsumoServicio(req.params.insumoId, { activo: req.body.activo, fecha_actualizacion: new Date().toISOString() }) })
  } catch (e) { return responderError(res, e) }
}

export async function listarProveedores(req, res) { try { return res.json({ proveedores: await listarProveedoresServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearProveedor(req, res) {
  try {
    return res.status(201).json({ proveedor: await crearProveedorServicio(normalizarProveedor(req.body)) })
  } catch (e) { return responderError(res, e) }
}

export async function actualizarInsumoDatos(req, res) {
  try {
    if (!uuid(req.params.insumoId)) throw new Error('Solicitud inválida')
    exigirObjeto(req.body, CAMPOS_INSUMO)
    if (!Object.keys(req.body).length) throw new Error('Solicitud inválida')
    const datos = {}
    const limitesTextoInsumo = { codigo: 40, nombre: 150, categoria: 50, unidad_medida: 20 }
    for (const campo of Object.keys(limitesTextoInsumo)) {
      if (Object.hasOwn(req.body, campo)) {
        if (!texto(req.body[campo], limitesTextoInsumo[campo])) throw new Error('Solicitud inválida')
        datos[campo] = req.body[campo].trim()
      }
    }
    if (Object.hasOwn(req.body, 'codigo')) datos.codigo = datos.codigo.toUpperCase()
    for (const campo of ['costo_referencia', 'stock_actual', 'stock_minimo']) {
      if (Object.hasOwn(req.body, campo)) {
        if (typeof req.body[campo] !== 'number' || !Number.isFinite(req.body[campo]) || req.body[campo] < 0) throw new Error('Solicitud inválida')
        datos[campo] = req.body[campo]
      }
    }
    datos.fecha_actualizacion = new Date().toISOString()
    const insumo = await actualizarInsumoServicio(req.params.insumoId, datos)
    emitirAlertasStockBajoSinBloquear()
    return res.json({ insumo })
  } catch (e) { return responderError(res, e) }
}

export async function eliminarInsumo(req, res) {
  try {
    if (!uuid(req.params.insumoId)) throw new Error('Solicitud inválida')
    await eliminarInsumoServicio(req.params.insumoId)
    return res.status(204).send()
  } catch (e) {
    if (e instanceof ErrorServicioOperaciones && e.codigo === '23503') return res.status(400).json({ ok: false, message: 'No se puede eliminar el insumo porque está siendo utilizado en otros registros.' })
    return responderError(res, e)
  }
}

export async function eliminarProveedor(req, res) {
  try {
    if (!uuid(req.params.proveedorId)) throw new Error('Solicitud inválida')
    await eliminarProveedorServicio(req.params.proveedorId)
    return res.status(204).send()
  } catch (e) { return responderError(res, e) }
}

export async function actualizarProveedorEstado(req, res) {
  try {
    if (!uuid(req.params.proveedorId) || !objeto(req.body) || typeof req.body.activo !== 'boolean') throw new Error('Solicitud inválida')
    return res.json({ proveedor: await actualizarProveedorServicio(req.params.proveedorId, { activo: req.body.activo, fecha_actualizacion: new Date().toISOString() }) })
  } catch (e) { return responderError(res, e) }
}

export async function actualizarProveedor(req, res) {
  try {
    if (!uuid(req.params.proveedorId)) throw new Error('Solicitud inválida')
    const datos = normalizarProveedor(req.body, true)
    datos.fecha_actualizacion = new Date().toISOString()
    return res.json({ proveedor: await actualizarProveedorServicio(req.params.proveedorId, datos) })
  } catch (e) { return responderError(res, e) }
}

export async function listarCompras(req, res) { try { return res.json({ compras: await listarComprasServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearCompra(req, res) {
  try { exigirObjeto(req.body, ['numero', 'proveedor_id', 'fecha_compra', 'total', 'observaciones']); if (!texto(req.body.numero, 40) || !uuid(req.body.proveedor_id)) throw new Error('Solicitud inválida'); return res.status(201).json({ compra: await crearCompraServicio({ ...req.body, creado_por: req.usuario.id }) }) } catch (e) { return responderError(res, e) }
}

export async function recibirCompra(req, res) {
  try {
    if (!uuid(req.params.compraId)) throw new Error('Solicitud inválida')
    const lotesCreados = await recibirCompraServicio(req.params.compraId, req.usuario.id)
    return res.json({ ok: true, lotes_creados: Number(lotesCreados ?? 0) })
  } catch (e) { return responderError(res, e) }
}

export async function crearCompraDetalle(req, res) {
  try {
    if (!uuid(req.params.compraId)) throw new Error('Solicitud inválida')
    exigirObjeto(req.body, ['insumo_id', 'variante_id', 'descripcion', 'cantidad', 'costo_unitario'])
    if (!texto(req.body.descripcion, 200) || typeof req.body.cantidad !== 'number' || req.body.cantidad <= 0 || typeof req.body.costo_unitario !== 'number' || req.body.costo_unitario < 0 || (Boolean(req.body.insumo_id) === Boolean(req.body.variante_id))) throw new Error('Solicitud inválida')
    return res.status(201).json({ detalle: await crearCompraDetalleServicio({ ...req.body, compra_id: req.params.compraId }) })
  } catch (e) { return responderError(res, e) }
}

export async function listarPedidos(req, res) { try { return res.json({ pedidos: await listarPedidosServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearPedido(req, res) {
  try { exigirObjeto(req.body, ['numero', 'cliente_id', 'cotizacion_id', 'fecha_entrega_estimada', 'direccion_entrega', 'observaciones']); if (!texto(req.body.numero, 40) || !uuid(req.body.cliente_id)) throw new Error('Solicitud inválida'); return res.status(201).json({ pedido: await crearPedidoServicio({ ...req.body, creado_por: req.usuario.id }) }) } catch (e) { return responderError(res, e) }
}

export async function reservarPedidoFifo(req, res) {
  try {
    if (!uuid(req.params.pedidoId)) throw new Error('Solicitud inválida')
    const reservasCreadas = await reservarPedidoFifoServicio(req.params.pedidoId, req.usuario.id)
    return res.json({ ok: true, reservas_creadas: Number(reservasCreadas ?? 0) })
  } catch (e) { return responderError(res, e) }
}

export async function liberarReserva(req, res) {
  try { if (!uuid(req.params.reservaId)) throw new Error('Solicitud inválida'); await liberarReservaServicio(req.params.reservaId); return res.json({ ok: true }) } catch (e) { return responderError(res, e) }
}

export async function consumirReserva(req, res) {
  try { if (!uuid(req.params.reservaId)) throw new Error('Solicitud inválida'); await consumirReservaServicio(req.params.reservaId); return res.json({ ok: true }) } catch (e) { return responderError(res, e) }
}

export async function listarReservas(req, res) { try { return res.json({ reservas: await listarReservasServicio() }) } catch (e) { return responderError(res, e) } }

export async function crearPedidoDetalle(req, res) {
  try {
    if (!uuid(req.params.pedidoId)) throw new Error('Solicitud inválida')
    exigirObjeto(req.body, ['variante_id', 'lote_id', 'descripcion', 'cantidad', 'precio_unitario'])
    if (!texto(req.body.descripcion, 200) || !uuid(req.body.variante_id) || (req.body.lote_id !== null && !uuid(req.body.lote_id)) || !Number.isSafeInteger(req.body.cantidad) || req.body.cantidad <= 0 || typeof req.body.precio_unitario !== 'number' || req.body.precio_unitario < 0) throw new Error('Solicitud inválida')
    return res.status(201).json({ detalle: await crearPedidoDetalleServicio({ ...req.body, pedido_id: req.params.pedidoId }) })
  } catch (e) { return responderError(res, e) }
}

export async function listarOrdenesEmpaque(req, res) { try { return res.json({ ordenes: await listarOrdenesEmpaqueServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearOrdenEmpaque(req, res) {
  try {
    exigirObjeto(req.body, ['numero', 'pedido_id', 'cantidad_paquetes', 'observaciones'])
    if (!texto(req.body.numero, 40) || (req.body.pedido_id !== null && !uuid(req.body.pedido_id)) || !entero(req.body.cantidad_paquetes, 0)) throw new Error('Solicitud inválida')
    return res.status(201).json({ orden: await crearOrdenEmpaqueServicio({ ...req.body, creado_por: req.usuario.id }) })
  } catch (e) { return responderError(res, e) }
}

export async function actualizarOrdenEmpaque(req, res) {
  try {
    if (!uuid(req.params.ordenId) || !objeto(req.body) || !['en_proceso', 'completada', 'cancelada'].includes(req.body.estado)) throw new Error('Solicitud inválida')
    const datos = { estado: req.body.estado, fecha_finalizacion: req.body.estado === 'completada' ? new Date().toISOString() : null }
    return res.json({ orden: await actualizarOrdenEmpaqueServicio(req.params.ordenId, datos) })
  } catch (e) { return responderError(res, e) }
}

export async function listarDespachos(req, res) { try { return res.json({ despachos: await listarDespachosServicio() }) } catch (e) { return responderError(res, e) } }
export async function crearDespacho(req, res) {
  try { exigirObjeto(req.body, ['pedido_id', 'transportista', 'observaciones']); if (!uuid(req.body.pedido_id)) throw new Error('Solicitud inválida'); return res.status(201).json({ despacho: await crearDespachoServicio({ ...req.body, creado_por: req.usuario.id }) }) } catch (e) { return responderError(res, e) }
}

export async function actualizarDespacho(req, res) {
  try {
    if (!uuid(req.params.despachoId) || !objeto(req.body) || !['preparando', 'enviado', 'entregado', 'devuelto', 'cancelado'].includes(req.body.estado)) throw new Error('Solicitud inválida')
    const datos = { estado: req.body.estado, fecha_despacho: req.body.estado === 'enviado' ? new Date().toISOString() : undefined, fecha_entrega: req.body.estado === 'entregado' ? new Date().toISOString() : undefined, entregado_por: req.body.estado === 'entregado' ? req.usuario.id : undefined }
    return res.json({ despacho: await actualizarDespachoServicio(req.params.despachoId, Object.fromEntries(Object.entries(datos).filter(([, valor]) => valor !== undefined))) })
  } catch (e) { return responderError(res, e) }
}

export async function registrarCalidad(req, res) {
  try { exigirObjeto(req.body, ['lote_id', 'resultado', 'observaciones', 'evidencia_url']); if (!uuid(req.body.lote_id) || !['aprobado', 'observado', 'rechazado'].includes(req.body.resultado)) throw new Error('Solicitud inválida'); return res.status(201).json({ inspeccion: await registrarCalidadServicio({ ...req.body, inspeccionado_por: req.usuario.id }) }) } catch (e) { return responderError(res, e) }
}

export async function registrarMerma(req, res) {
  try { exigirObjeto(req.body, ['lote_id', 'insumo_id', 'etapa', 'motivo', 'cantidad', 'costo_unitario', 'observaciones']); if ((!uuid(req.body.lote_id) && !uuid(req.body.insumo_id)) || (uuid(req.body.lote_id) && uuid(req.body.insumo_id)) || !['recepcion', 'clasificacion', 'empaque', 'almacenamiento', 'despacho', 'produccion'].includes(req.body.etapa) || !texto(req.body.motivo, 100) || typeof req.body.cantidad !== 'number' || req.body.cantidad <= 0) throw new Error('Solicitud inválida'); return res.status(201).json({ merma: await registrarMermaOperativaServicio({ ...req.body, registrado_por: req.usuario.id }) }) } catch (e) { return responderError(res, e) }
}

export async function listarMermas(req, res) { try { return res.json({ mermas: await listarMermasServicio() }) } catch (e) { return responderError(res, e) } }

export async function generarQrLote(req, res) {
  try {
    if (!uuid(req.params.loteId)) throw new Error('Solicitud inválida')
    return res.status(201).json({ qr: await generarQrLoteServicio(req.params.loteId) })
  } catch (e) { return responderError(res, e) }
}
