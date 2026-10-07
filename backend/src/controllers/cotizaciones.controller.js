import {
  ErrorServicioCotizaciones,
  actualizarCotizacion as actualizarCotizacionServicio,
  cambiarEstadoCotizacion as cambiarEstadoCotizacionServicio,
  crearCotizacion as crearCotizacionServicio,
  listarCotizaciones as listarCotizacionesServicio,
  obtenerCotizacion as obtenerCotizacionServicio,
} from '../services/cotizaciones.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const ESTADOS = new Set(['borrador', 'emitida', 'anulada', 'convertida'])
const ESTADOS_MUTABLES = new Set(['emitida', 'anulada'])
const CAMPOS_COTIZACION = new Set([
  'cliente_id',
  'comprador_nombre',
  'comprador_nit',
  'comprador_direccion',
  'observaciones',
  'detalles',
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

const esFechaValida = (valor) => {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) return false

  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  )
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
  if (query.fecha_desde !== undefined) {
    if (!esFechaValida(query.fecha_desde)) throw new ErrorSolicitudInvalida()
    opciones.fechaDesde = query.fecha_desde
  }
  if (query.fecha_hasta !== undefined) {
    if (!esFechaValida(query.fecha_hasta)) throw new ErrorSolicitudInvalida()
    opciones.fechaHasta = query.fecha_hasta
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

const crearDatosCotizacion = (body) => {
  if (!esObjeto(body)) throw new ErrorSolicitudInvalida()

  const campos = Object.keys(body)
  if (
    campos.some((campo) => !CAMPOS_COTIZACION.has(campo)) ||
    !Object.prototype.hasOwnProperty.call(body, 'detalles') ||
    !Array.isArray(body.detalles) ||
    body.detalles.length < 1 ||
    body.detalles.length > 100
  ) {
    throw new ErrorSolicitudInvalida()
  }

  let clienteId = null
  if (body.cliente_id !== undefined && body.cliente_id !== null) {
    clienteId = validarUuid(body.cliente_id)
  }

  const detalles = body.detalles.map((detalle) => {
    if (
      !esObjeto(detalle) ||
      Object.keys(detalle).length !== CAMPOS_DETALLE.size ||
      Object.keys(detalle).some((campo) => !CAMPOS_DETALLE.has(campo))
    ) {
      throw new ErrorSolicitudInvalida()
    }

    return {
      variante_id: validarUuid(detalle.variante_id),
      presentacion_id: validarUuid(detalle.presentacion_id),
      cantidad_presentaciones: convertirEnteroPositivo(
        detalle.cantidad_presentaciones,
      ),
    }
  })

  if (
    detalles.some((detalle) => detalle.cantidad_presentaciones > 1000000)
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return {
    cliente_id: clienteId,
    comprador_nombre: normalizarTextoOpcional(body.comprador_nombre, 200),
    comprador_nit: normalizarNit(body.comprador_nit),
    comprador_direccion: normalizarTextoOpcional(
      body.comprador_direccion,
      500,
    ),
    observaciones: normalizarTextoOpcional(body.observaciones, 1000),
    detalles,
  }
}

const mensajesSegurosSupabase = new Map([
  [
    'El usuario no tiene una serie de documentos asignada.',
    'El usuario no tiene una serie de documentos asignada.',
  ],
  [
    'La cotización solicitada no existe.',
    'La cotización solicitada no existe.',
  ],
  [
    'La cotización ya no puede editarse.',
    'La cotización ya no puede editarse.',
  ],
  [
    'La transición de estado solicitada no es válida.',
    'La transición de estado solicitada no es válida.',
  ],
  [
    'La cotización no tiene un detalle válido para emitirse.',
    'La cotización no tiene un detalle válido para emitirse.',
  ],
  [
    'El cliente solicitado no existe o no está activo.',
    'El cliente solicitado no existe o no está activo.',
  ],
  [
    'Una variante solicitada no existe o no está activa.',
    'Una variante solicitada no existe o no está activa.',
  ],
  [
    'Una presentación solicitada no existe o no está activa.',
    'Una presentación solicitada no existe o no está activa.',
  ],
  [
    'No existe un precio vigente para una línea solicitada.',
    'No existe un precio vigente para una línea solicitada.',
  ],
  [
    'No se permiten líneas duplicadas en una cotización.',
    'No se permiten líneas duplicadas en una cotización.',
  ],
  [
    'El total de la cotización excede el límite permitido.',
    'El total de la cotización excede el límite permitido.',
  ],
])

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'La cotización solicitada no existe' },
  23505: {
    estado: 409,
    mensaje: 'No se permiten líneas duplicadas en una cotización.',
  },
  23514: {
    estado: 409,
    mensaje: 'La operación solicitada no puede realizarse.',
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({ ok: false, message: MENSAJE_SOLICITUD_INVALIDA })
  }

  if (error instanceof ErrorServicioCotizaciones) {
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

export async function listarCotizaciones(req, res) {
  try {
    const resultado = await listarCotizacionesServicio(
      req.autenticacion?.token,
      crearOpcionesListado(req.query),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerCotizacion(req, res) {
  try {
    validarUuid(req.params.cotizacionId)
    const resultado = await obtenerCotizacionServicio(
      req.autenticacion?.token,
      req.params.cotizacionId,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function crearCotizacion(req, res) {
  try {
    const resultado = await crearCotizacionServicio(
      req.autenticacion?.token,
      crearDatosCotizacion(req.body),
    )
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function actualizarCotizacion(req, res) {
  try {
    validarUuid(req.params.cotizacionId)
    const resultado = await actualizarCotizacionServicio(
      req.autenticacion?.token,
      req.params.cotizacionId,
      crearDatosCotizacion(req.body),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function cambiarEstadoCotizacion(req, res) {
  try {
    validarUuid(req.params.cotizacionId)

    if (
      !esObjeto(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.estado !== 'string'
    ) {
      throw new ErrorSolicitudInvalida()
    }

    const estado = req.body.estado.trim().toLowerCase()
    if (!ESTADOS_MUTABLES.has(estado)) throw new ErrorSolicitudInvalida()

    const resultado = await cambiarEstadoCotizacionServicio(
      req.autenticacion?.token,
      req.params.cotizacionId,
      estado,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
