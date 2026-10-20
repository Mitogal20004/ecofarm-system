import {
  ErrorServicioReportes,
  listarProductosVendidos as listarProductosVendidosServicio,
  obtenerReporteCotizaciones as obtenerReporteCotizacionesServicio,
  obtenerReporteInventario as obtenerReporteInventarioServicio,
  obtenerReporteMovimientosInventario as obtenerReporteMovimientosServicio,
  obtenerReporteVentas as obtenerReporteVentasServicio,
} from '../services/reportes.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const PATRON_SERIE = /^[A-Z0-9]{1,8}$/
const PATRON_ORIGEN = /^[a-z][a-z0-9_]*$/
const CLASIFICACIONES = new Set(['normal', 'completa', 'premium'])
const ESTADOS_STOCK = new Set(['sin_stock', 'stock_bajo', 'disponible'])
const TIPOS_MOVIMIENTO = new Set(['entrada', 'salida', 'ajuste'])
const MAXIMO_INTEGER = 2147483647

const CAMPOS_VENTAS = new Set([
  'fecha_desde',
  'fecha_hasta',
  'cliente_id',
  'serie',
  'usuario_id',
])
const CAMPOS_PRODUCTOS = new Set([
  'fecha_desde',
  'fecha_hasta',
  'pagina',
  'limite',
  'variante_id',
  'presentacion_id',
])
const CAMPOS_INVENTARIO = new Set([
  'pagina',
  'limite',
  'busqueda',
  'longitud_cm',
  'clasificacion',
  'estado_stock',
  'activo',
])
const CAMPOS_MOVIMIENTOS = new Set([
  'fecha_desde',
  'fecha_hasta',
  'pagina',
  'limite',
  'busqueda',
  'variante_id',
  'tipo',
  'origen',
  'usuario_id',
])
const CAMPOS_COTIZACIONES = new Set([
  'fecha_desde',
  'fecha_hasta',
  'cliente_id',
  'serie',
  'usuario_id',
])

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const normalizarEspacios = (valor) => valor.trim().replace(/\s+/g, ' ')

const validarCamposQuery = (query, permitidos) => {
  if (
    !esObjeto(query) ||
    Object.keys(query).some((campo) => !permitidos.has(campo))
  ) {
    throw new ErrorSolicitudInvalida()
  }
}

const validarUuid = (valor) => {
  if (typeof valor !== 'string' || !PATRON_UUID.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
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

const validarPeriodo = (query, opciones) => {
  opciones.fechaDesde = validarFecha(query.fecha_desde)
  opciones.fechaHasta = validarFecha(query.fecha_hasta)

  if (opciones.fechaDesde > opciones.fechaHasta) {
    throw new ErrorSolicitudInvalida()
  }
}

const convertirEnteroQuery = (valor) => {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const numero = Number(valor)
  if (
    !Number.isSafeInteger(numero) ||
    numero < 1 ||
    numero > MAXIMO_INTEGER
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const agregarPaginacion = (query, opciones) => {
  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroQuery(query.pagina)
  }
  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroQuery(query.limite)
    if (opciones.limite > 100) throw new ErrorSolicitudInvalida()
  }
}

const agregarSerie = (query, opciones) => {
  if (query.serie === undefined) return
  if (typeof query.serie !== 'string') throw new ErrorSolicitudInvalida()

  const serie = query.serie.trim().toUpperCase()
  if (serie && !PATRON_SERIE.test(serie)) {
    throw new ErrorSolicitudInvalida()
  }
  opciones.serie = serie || null
}

const agregarFiltrosComunes = (query, opciones) => {
  if (query.cliente_id !== undefined) {
    opciones.clienteId = validarUuid(query.cliente_id)
  }
  if (query.usuario_id !== undefined) {
    opciones.usuarioId = validarUuid(query.usuario_id)
  }
  agregarSerie(query, opciones)
}

const crearOpcionesVentas = (query) => {
  validarCamposQuery(query, CAMPOS_VENTAS)
  const opciones = {}
  validarPeriodo(query, opciones)
  agregarFiltrosComunes(query, opciones)
  return opciones
}

const crearOpcionesProductos = (query) => {
  validarCamposQuery(query, CAMPOS_PRODUCTOS)
  const opciones = {}
  validarPeriodo(query, opciones)
  agregarPaginacion(query, opciones)

  if (query.variante_id !== undefined) {
    opciones.varianteId = validarUuid(query.variante_id)
  }
  if (query.presentacion_id !== undefined) {
    opciones.presentacionId = validarUuid(query.presentacion_id)
  }

  return opciones
}

const crearOpcionesInventario = (query) => {
  validarCamposQuery(query, CAMPOS_INVENTARIO)
  const opciones = {}
  agregarPaginacion(query, opciones)

  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') throw new ErrorSolicitudInvalida()
    opciones.busqueda = normalizarEspacios(query.busqueda)
    if (opciones.busqueda.length > 150) throw new ErrorSolicitudInvalida()
  }
  if (query.longitud_cm !== undefined) {
    opciones.longitudCm = convertirEnteroQuery(query.longitud_cm)
  }
  if (query.clasificacion !== undefined) {
    if (typeof query.clasificacion !== 'string') {
      throw new ErrorSolicitudInvalida()
    }
    opciones.clasificacion = query.clasificacion.trim().toLowerCase()
    if (!CLASIFICACIONES.has(opciones.clasificacion)) {
      throw new ErrorSolicitudInvalida()
    }
  }
  if (query.estado_stock !== undefined) {
    if (typeof query.estado_stock !== 'string') {
      throw new ErrorSolicitudInvalida()
    }
    opciones.estadoStock = query.estado_stock.trim().toLowerCase()
    if (!ESTADOS_STOCK.has(opciones.estadoStock)) {
      throw new ErrorSolicitudInvalida()
    }
  }
  if (query.activo !== undefined) {
    if (query.activo === 'true') opciones.activo = true
    else if (query.activo === 'false') opciones.activo = false
    else throw new ErrorSolicitudInvalida()
  }

  return opciones
}

const crearOpcionesMovimientos = (query) => {
  validarCamposQuery(query, CAMPOS_MOVIMIENTOS)
  const opciones = {}
  validarPeriodo(query, opciones)
  agregarPaginacion(query, opciones)

  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') throw new ErrorSolicitudInvalida()
    opciones.busqueda = normalizarEspacios(query.busqueda)
    if (opciones.busqueda.length > 150) throw new ErrorSolicitudInvalida()
  }
  if (query.variante_id !== undefined) {
    opciones.varianteId = validarUuid(query.variante_id)
  }
  if (query.tipo !== undefined) {
    if (typeof query.tipo !== 'string') throw new ErrorSolicitudInvalida()
    opciones.tipo = query.tipo.trim().toLowerCase()
    if (!TIPOS_MOVIMIENTO.has(opciones.tipo)) {
      throw new ErrorSolicitudInvalida()
    }
  }
  if (query.origen !== undefined) {
    if (typeof query.origen !== 'string') throw new ErrorSolicitudInvalida()
    opciones.origen = query.origen.trim().toLowerCase()
    if (
      opciones.origen.length > 40 ||
      !PATRON_ORIGEN.test(opciones.origen)
    ) {
      throw new ErrorSolicitudInvalida()
    }
  }
  if (query.usuario_id !== undefined) {
    opciones.usuarioId = validarUuid(query.usuario_id)
  }

  return opciones
}

const crearOpcionesCotizaciones = (query) => {
  validarCamposQuery(query, CAMPOS_COTIZACIONES)
  const opciones = {}
  validarPeriodo(query, opciones)
  agregarFiltrosComunes(query, opciones)
  return opciones
}

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({
      ok: false,
      message: MENSAJE_SOLICITUD_INVALIDA,
    })
  }

  if (error instanceof ErrorServicioReportes) {
    const respuesta = respuestasPorCodigo[error.codigo]
    if (respuesta) {
      return res.status(respuesta.estado).json({
        ok: false,
        message: respuesta.mensaje,
      })
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

const serviciosPredeterminados = Object.freeze({
  obtenerReporteVentas: obtenerReporteVentasServicio,
  listarProductosVendidos: listarProductosVendidosServicio,
  obtenerReporteInventario: obtenerReporteInventarioServicio,
  obtenerReporteMovimientosInventario: obtenerReporteMovimientosServicio,
  obtenerReporteCotizaciones: obtenerReporteCotizacionesServicio,
})

export function crearControladoresReportes(
  servicios = serviciosPredeterminados,
) {
  const crearControlador = (crearOpciones, ejecutarServicio) =>
    async function consultarReporte(req, res) {
      try {
        const resultado = await ejecutarServicio(
          req.autenticacion?.token,
          crearOpciones(req.query),
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    }

  return Object.freeze({
    obtenerReporteVentas: crearControlador(
      crearOpcionesVentas,
      servicios.obtenerReporteVentas,
    ),
    listarProductosVendidos: crearControlador(
      crearOpcionesProductos,
      servicios.listarProductosVendidos,
    ),
    obtenerReporteInventario: crearControlador(
      crearOpcionesInventario,
      servicios.obtenerReporteInventario,
    ),
    obtenerReporteMovimientosInventario: crearControlador(
      crearOpcionesMovimientos,
      servicios.obtenerReporteMovimientosInventario,
    ),
    obtenerReporteCotizaciones: crearControlador(
      crearOpcionesCotizaciones,
      servicios.obtenerReporteCotizaciones,
    ),
  })
}

export const validadoresReportes = Object.freeze({
  crearOpcionesVentas,
  crearOpcionesProductos,
  crearOpcionesInventario,
  crearOpcionesMovimientos,
  crearOpcionesCotizaciones,
})

const controladoresReportes = crearControladoresReportes()

export const obtenerReporteVentas =
  controladoresReportes.obtenerReporteVentas
export const listarProductosVendidos =
  controladoresReportes.listarProductosVendidos
export const obtenerReporteInventario =
  controladoresReportes.obtenerReporteInventario
export const obtenerReporteMovimientosInventario =
  controladoresReportes.obtenerReporteMovimientosInventario
export const obtenerReporteCotizaciones =
  controladoresReportes.obtenerReporteCotizaciones
