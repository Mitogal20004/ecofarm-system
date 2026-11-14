import { randomUUID } from 'node:crypto'
import {
  ErrorServicioVentas,
  anularVenta as anularVentaServicio,
  confirmarVenta as confirmarVentaServicio,
  confirmarVentaCredito as confirmarVentaCreditoServicio,
  convertirCotizacionVenta as convertirCotizacionVentaServicio,
  convertirCotizacionVentaCredito as convertirCotizacionVentaCreditoServicio,
  generarReciboVenta as generarReciboVentaServicio,
  listarVentas as listarVentasServicio,
  obtenerVenta as obtenerVentaServicio,
} from '../services/ventas.service.js'
import { crearPaymentIntent } from '../services/stripe.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const PATRON_MONTO = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/
const ESTADOS = new Set(['confirmada', 'anulada'])
const TIPOS_DOCUMENTO = new Set(['recibo', 'sin_documento'])
const CAMPOS_VENTA = new Set([
  'cliente_id',
  'comprador_nombre',
  'comprador_nit',
  'comprador_direccion',
  'observaciones',
  'detalles',
  'monto_recibido',
  'metodo_pago',
  'stripe_payment_intent_id',
])
const CAMPOS_DETALLE = new Set([
  'variante_id',
  'presentacion_id',
  'cantidad_presentaciones',
])

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const normalizarEspacios = (valor) => valor.trim().replace(/\s+/g, ' ')

const validarUuid = (valor) => {
  if (typeof valor !== 'string' || !PATRON_UUID.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
}

const convertirEnteroPositivo = (valor) => {
  const numero = typeof valor === 'number' ? valor : Number(valor)

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const normalizarMontoPositivo = (valor) => {
  let texto = ''
  if (typeof valor === 'number') texto = String(valor)
  if (typeof valor === 'string') texto = valor.trim()
  const numero = Number(texto)

  if (
    !PATRON_MONTO.test(texto) ||
    !Number.isFinite(numero) ||
    numero <= 0 ||
    numero > 999999999999.99
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return texto
}

const normalizarMontoVenta = (valor) => {
  let texto = ''
  if (typeof valor === 'number') texto = String(valor)
  if (typeof valor === 'string') texto = valor.trim()
  const numero = Number(texto)
  if (!PATRON_MONTO.test(texto) || !Number.isFinite(numero) || numero < 0 || numero > 999999999999.99) {
    throw new ErrorSolicitudInvalida()
  }
  return texto
}

const normalizarTextoOpcional = (valor, limite) => {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()

  const texto = normalizarEspacios(valor)
  if (texto.length > limite) throw new ErrorSolicitudInvalida()
  return texto || null
}

const normalizarNit = (valor) => {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()

  const nit = valor.toUpperCase().replace(/[\s-]+/g, '')
  if (nit.length > 30) throw new ErrorSolicitudInvalida()
  return nit || null
}

const validarFecha = (valor) => {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
}

const crearOpcionesListado = (query) => {
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroPositivo(query.pagina)
  }
  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroPositivo(query.limite)
    if (opciones.limite > 100) throw new ErrorSolicitudInvalida()
  }
  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') throw new ErrorSolicitudInvalida()
    opciones.busqueda = normalizarEspacios(query.busqueda)
    if (opciones.busqueda.length > 200) throw new ErrorSolicitudInvalida()
  }
  if (query.estado !== undefined) {
    if (typeof query.estado !== 'string') throw new ErrorSolicitudInvalida()
    opciones.estado = query.estado.trim().toLowerCase()
    if (!ESTADOS.has(opciones.estado)) throw new ErrorSolicitudInvalida()
  }
  if (query.tipo_documento !== undefined) {
    if (typeof query.tipo_documento !== 'string') {
      throw new ErrorSolicitudInvalida()
    }
    opciones.tipoDocumento = query.tipo_documento.trim().toLowerCase()
    if (!TIPOS_DOCUMENTO.has(opciones.tipoDocumento)) {
      throw new ErrorSolicitudInvalida()
    }
  }
  if (query.fecha_desde !== undefined) {
    opciones.fechaDesde = validarFecha(query.fecha_desde)
  }
  if (query.fecha_hasta !== undefined) {
    opciones.fechaHasta = validarFecha(query.fecha_hasta)
  }
  if (query.usuario_id !== undefined) {
    opciones.usuarioId = validarUuid(query.usuario_id)
  }
  if (
    opciones.fechaDesde &&
    opciones.fechaHasta &&
    opciones.fechaDesde > opciones.fechaHasta
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return opciones
}

const crearDatosVenta = (body, permitirSaldo = false) => {
  if (!esObjeto(body)) throw new ErrorSolicitudInvalida()

  const campos = Object.keys(body)
  if (
    campos.some((campo) => !CAMPOS_VENTA.has(campo)) ||
    !Object.prototype.hasOwnProperty.call(body, 'monto_recibido') ||
    !Object.prototype.hasOwnProperty.call(body, 'detalles') ||
    !Array.isArray(body.detalles) ||
    body.detalles.length < 1 ||
    body.detalles.length > 100
  ) {
    throw new ErrorSolicitudInvalida()
  }

  const clienteId = body.cliente_id == null
    ? null
    : validarUuid(body.cliente_id)
  const detalles = body.detalles.map((detalle) => {
    if (
      !esObjeto(detalle) ||
      Object.keys(detalle).length !== CAMPOS_DETALLE.size ||
      Object.keys(detalle).some((campo) => !CAMPOS_DETALLE.has(campo))
    ) {
      throw new ErrorSolicitudInvalida()
    }

    const cantidad = convertirEnteroPositivo(detalle.cantidad_presentaciones)
    if (cantidad > 1000000) throw new ErrorSolicitudInvalida()

    return {
      variante_id: validarUuid(detalle.variante_id),
      presentacion_id: validarUuid(detalle.presentacion_id),
      cantidad_presentaciones: cantidad,
    }
  })
  const claves = detalles.map(
    (detalle) => `${detalle.variante_id}:${detalle.presentacion_id}`,
  )
  if (new Set(claves).size !== claves.length) {
    throw new ErrorSolicitudInvalida()
  }

  const nombre = clienteId
    ? null
    : normalizarTextoOpcional(body.comprador_nombre, 200)
  const nit = clienteId ? null : normalizarNit(body.comprador_nit)
  if (!clienteId && (!nombre || !nit)) throw new ErrorSolicitudInvalida()

  const metodoPago = body.metodo_pago ?? 'efectivo'
  if (!['efectivo', 'tarjeta'].includes(metodoPago)) throw new ErrorSolicitudInvalida()
  const paymentIntentId = body.stripe_payment_intent_id ?? null
  if (paymentIntentId !== null && (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId))) {
    throw new ErrorSolicitudInvalida()
  }
  if (metodoPago === 'tarjeta' && !paymentIntentId) throw new ErrorSolicitudInvalida()
  if (metodoPago === 'tarjeta' && Number(body.monto_recibido) <= 0) throw new ErrorSolicitudInvalida()

  return {
    cliente_id: clienteId,
    comprador_nombre: nombre,
    comprador_nit: nit,
    comprador_direccion: clienteId
      ? null
      : normalizarTextoOpcional(body.comprador_direccion, 500),
    observaciones: normalizarTextoOpcional(body.observaciones, 1000),
    monto_recibido: permitirSaldo
      ? normalizarMontoVenta(body.monto_recibido)
      : normalizarMontoPositivo(body.monto_recibido),
    metodo_pago: metodoPago,
    stripe_payment_intent_id: paymentIntentId,
    detalles,
  }
}

const crearDatosPago = (body) => {
  if (
    !esObjeto(body) ||
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'monto_recibido')
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return normalizarMontoPositivo(body.monto_recibido)
}

const mensajesSegurosSupabase = new Map([
  [
    'Debes abrir Caja antes de confirmar una venta.',
    'Debes abrir Caja antes de confirmar una venta.',
  ],
  [
    'El monto recibido es insuficiente para completar la Venta.',
    'El monto recibido es insuficiente para completar la venta.',
  ],
  ['El usuario no tiene una serie de documentos asignada.', 'Tu usuario no tiene una serie de documentos asignada.'],
  ['El cliente solicitado no existe o no está activo.', 'El cliente seleccionado no existe o está inactivo.'],
  ['Una variante solicitada no existe o no está activa.', 'Una variante seleccionada no existe o está inactiva.'],
  ['Una presentación solicitada no existe o no está activa.', 'Una presentación seleccionada no existe o está inactiva.'],
  ['No existe un precio vigente para una línea solicitada.', 'Una línea ya no tiene precio vigente. Actualiza el carrito.'],
  ['No hay stock suficiente para completar la Venta.', 'No hay stock suficiente para completar la venta.'],
  ['No se permiten líneas duplicadas en una Venta.', 'El carrito contiene líneas duplicadas.'],
  ['El total de la Venta excede el límite permitido.', 'El total de la venta excede el límite permitido.'],
  ['La clave de idempotencia ya fue utilizada.', 'La intención de compra ya fue utilizada. Inicia una venta nueva.'],
  ['La Cotización solicitada no existe.', 'La cotización solicitada no existe.'],
  ['La Cotización ya fue convertida en Venta.', 'La cotización ya fue convertida en venta.'],
  ['Solo una Cotización emitida puede convertirse en Venta.', 'Solo una cotización emitida puede convertirse en venta.'],
  ['La Cotización no tiene un detalle válido para convertirse.', 'La cotización no tiene un detalle válido para convertirse.'],
  ['La Venta solicitada no existe.', 'La venta solicitada no existe.'],
  ['La Venta no puede anularse en su estado actual.', 'La venta no puede anularse en su estado actual.'],
  ['La Venta no admite la emisión de un Recibo.', 'La venta no admite la emisión de un recibo.'],
  ['La Venta ya tiene un Recibo asociado.', 'La venta ya tiene un recibo asociado.'],
])

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  22003: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'El recurso solicitado no existe' },
  23505: { estado: 409, mensaje: 'La operación ya fue procesada.' },
  23514: { estado: 409, mensaje: 'La operación solicitada no puede realizarse.' },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({ ok: false, message: MENSAJE_SOLICITUD_INVALIDA })
  }

  if (error instanceof ErrorServicioVentas) {
    const respuesta = respuestasPorCodigo[error.codigo]
    if (respuesta) {
      return res.status(respuesta.estado).json({
        ok: false,
        message: mensajesSegurosSupabase.get(error.detalle) ?? respuesta.mensaje,
      })
    }
  }

  if (error?.codigo === '23514') {
    return res.status(409).json({
      ok: false,
      message: 'El pago con tarjeta no coincide con el monto de la venta.',
    })
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

export function crearIntencionVenta(_req, res) {
  return res.status(201).json({ clave_idempotencia: randomUUID() })
}

const crearDatosVentaCredito = (body) => {
  const datos = crearDatosVenta(body, true)
  if (!datos.cliente_id || datos.metodo_pago !== 'efectivo' || datos.stripe_payment_intent_id) {
    throw new ErrorSolicitudInvalida()
  }
  return datos
}

export async function crearPagoStripe(req, res) {
  try {
    const montoGtq = normalizarMontoPositivo(req.body?.monto_gtq)
    const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
    const resultado = await crearPaymentIntent({
      montoGtq,
      claveIdempotencia,
    })
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarVentas(req, res) {
  try {
    const resultado = await listarVentasServicio(
      req.autenticacion?.token,
      crearOpcionesListado(req.query),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerVenta(req, res) {
  try {
    validarUuid(req.params.ventaId)
    const resultado = await obtenerVentaServicio(
      req.autenticacion?.token,
      req.params.ventaId,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function confirmarVenta(req, res) {
  try {
    const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
    const resultado = await confirmarVentaServicio(
      req.autenticacion?.token,
      claveIdempotencia,
      crearDatosVenta(req.body),
    )
    return res.status(resultado.cambio ? 201 : 200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function confirmarVentaCredito(req, res) {
  try {
    const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
    const resultado = await confirmarVentaCreditoServicio(
      req.autenticacion?.token,
      claveIdempotencia,
      crearDatosVentaCredito(req.body),
    )
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function convertirCotizacionVenta(req, res) {
  try {
    validarUuid(req.params.cotizacionId)
    const resultado = await convertirCotizacionVentaServicio(
      req.autenticacion?.token,
      req.params.cotizacionId,
      crearDatosPago(req.body),
    )
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function convertirCotizacionVentaCredito(req, res) {
  try {
    validarUuid(req.params.cotizacionId)
    const resultado = await convertirCotizacionVentaCreditoServicio(
      req.autenticacion?.token,
      req.params.cotizacionId,
      normalizarMontoVenta(req.body?.monto_recibido),
    )
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function generarReciboVenta(req, res) {
  try {
    validarUuid(req.params.ventaId)
    if (req.body && Object.keys(req.body).length > 0) {
      throw new ErrorSolicitudInvalida()
    }
    const resultado = await generarReciboVentaServicio(
      req.autenticacion?.token,
      req.params.ventaId,
    )
    return res.status(resultado.cambio ? 201 : 200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function anularVenta(req, res) {
  try {
    validarUuid(req.params.ventaId)
    if (
      !esObjeto(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.motivo !== 'string'
    ) {
      throw new ErrorSolicitudInvalida()
    }
    const motivo = normalizarEspacios(req.body.motivo)
    if (!motivo || motivo.length > 400) throw new ErrorSolicitudInvalida()

    const resultado = await anularVentaServicio(
      req.autenticacion?.token,
      req.params.ventaId,
      motivo,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
