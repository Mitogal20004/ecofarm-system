import {
  ErrorServicioFacturasFel,
  listarFacturasFel as listarFacturasFelServicio,
  obtenerFacturaFel as obtenerFacturaFelServicio,
  solicitarFacturaFel as solicitarFacturaFelServicio,
} from '../services/facturas-fel.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const ESTADOS = new Set([
  'pendiente',
  'procesando',
  'certificada',
  'error',
  'anulada',
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
    if (opciones.busqueda.length > 150) throw new ErrorSolicitudInvalida()
  }
  if (query.estado !== undefined) {
    if (typeof query.estado !== 'string') throw new ErrorSolicitudInvalida()
    opciones.estado = query.estado.trim().toLowerCase()
    if (!ESTADOS.has(opciones.estado)) throw new ErrorSolicitudInvalida()
  }
  if (query.fecha_desde !== undefined) {
    opciones.fechaDesde = validarFecha(query.fecha_desde)
  }
  if (query.fecha_hasta !== undefined) {
    opciones.fechaHasta = validarFecha(query.fecha_hasta)
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

const mensajesSegurosSupabase = new Map([
  ['La venta solicitada no existe.', 'La venta solicitada no existe.'],
  ['La factura solicitada no existe.', 'La factura solicitada no existe.'],
  [
    'La operación solicitada no puede realizarse.',
    'La venta no admite una solicitud FEL en su estado actual.',
  ],
])

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'El recurso solicitado no existe' },
  23505: { estado: 409, mensaje: 'La operación ya fue procesada.' },
  23514: { estado: 409, mensaje: 'La operación solicitada no puede realizarse.' },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({
      ok: false,
      message: MENSAJE_SOLICITUD_INVALIDA,
    })
  }

  if (error instanceof ErrorServicioFacturasFel) {
    const respuesta = respuestasPorCodigo[error.codigo]

    if (respuesta) {
      return res.status(respuesta.estado).json({
        ok: false,
        message: mensajesSegurosSupabase.get(error.detalle) ?? respuesta.mensaje,
      })
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

export async function solicitarFacturaFel(req, res) {
  try {
    if (
      !esObjeto(req.body) ||
      Object.keys(req.body).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(req.body, 'venta_id')
    ) {
      throw new ErrorSolicitudInvalida()
    }

    const ventaId = validarUuid(req.body.venta_id)
    const resultado = await solicitarFacturaFelServicio(
      req.autenticacion?.token,
      ventaId,
    )

    return res.status(resultado.cambio ? 201 : 200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarFacturasFel(req, res) {
  try {
    const resultado = await listarFacturasFelServicio(
      req.autenticacion?.token,
      crearOpcionesListado(req.query),
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerFacturaFel(req, res) {
  try {
    const facturaId = validarUuid(req.params.facturaId)
    const resultado = await obtenerFacturaFelServicio(
      req.autenticacion?.token,
      facturaId,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
