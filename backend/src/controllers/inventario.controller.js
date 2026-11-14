import {
  ErrorServicioInventario,
  actualizarStockMinimo as actualizarStockMinimoServicio,
  listarInventario as listarInventarioServicio,
  listarMovimientos as listarMovimientosServicio,
  registrarAjuste as registrarAjusteServicio,
  registrarEntrada as registrarEntradaServicio,
  registrarSalida as registrarSalidaServicio,
} from '../services/inventario.service.js'
import { emitirAlertaSinBloquear } from '../services/alertas.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const CLASIFICACIONES = new Set(['normal', 'completa', 'premium'])
const ESTADOS_STOCK = new Set(['sin_stock', 'stock_bajo', 'disponible'])
const TIPOS_MOVIMIENTO = new Set(['entrada', 'salida', 'ajuste'])
const MAXIMO_INTEGER = 2147483647

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

const convertirEnteroQuery = (valor, minimo = 1) => {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const numero = Number(valor)

  if (
    !Number.isSafeInteger(numero) ||
    numero < minimo ||
    numero > MAXIMO_INTEGER
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const validarEnteroBody = (valor, minimo) => {
  if (
    !Number.isSafeInteger(valor) ||
    valor < minimo ||
    valor > MAXIMO_INTEGER
  ) {
    throw new ErrorSolicitudInvalida()
  }
  return valor
}

const validarCampos = (body, camposPermitidos) => {
  if (!esObjeto(body)) throw new ErrorSolicitudInvalida()
  const campos = Object.keys(body)

  if (
    campos.length !== camposPermitidos.size ||
    campos.some((campo) => !camposPermitidos.has(campo))
  ) {
    throw new ErrorSolicitudInvalida()
  }
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

const normalizarMotivo = (valor) => {
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()
  const motivo = normalizarEspacios(valor)

  if (!motivo || motivo.length > 500) throw new ErrorSolicitudInvalida()
  return motivo
}

const crearOpcionesInventario = (query) => {
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroQuery(query.pagina)
  }
  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroQuery(query.limite)
    if (opciones.limite > 100) throw new ErrorSolicitudInvalida()
  }
  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') throw new ErrorSolicitudInvalida()
    opciones.busqueda = normalizarEspacios(query.busqueda)
    if (opciones.busqueda.length > 150) throw new ErrorSolicitudInvalida()
  }
  if (query.longitud_cm !== undefined) {
    opciones.longitudCm = convertirEnteroQuery(query.longitud_cm)
  }
  if (query.clasificacion !== undefined) {
    if (!CLASIFICACIONES.has(query.clasificacion)) {
      throw new ErrorSolicitudInvalida()
    }
    opciones.clasificacion = query.clasificacion
  }
  if (query.estado_stock !== undefined) {
    if (!ESTADOS_STOCK.has(query.estado_stock)) {
      throw new ErrorSolicitudInvalida()
    }
    opciones.estadoStock = query.estado_stock
  }
  if (query.activo !== undefined) {
    if (query.activo === 'true') opciones.activo = true
    else if (query.activo === 'false') opciones.activo = false
    else throw new ErrorSolicitudInvalida()
  }

  return opciones
}

const crearOpcionesMovimientos = (query) => {
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroQuery(query.pagina)
  }
  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroQuery(query.limite)
    if (opciones.limite > 100) throw new ErrorSolicitudInvalida()
  }
  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') throw new ErrorSolicitudInvalida()
    opciones.busqueda = normalizarEspacios(query.busqueda)
    if (opciones.busqueda.length > 150) throw new ErrorSolicitudInvalida()
  }
  if (query.variante_id !== undefined) {
    opciones.varianteId = validarUuid(query.variante_id)
  }
  if (query.tipo !== undefined) {
    if (!TIPOS_MOVIMIENTO.has(query.tipo)) {
      throw new ErrorSolicitudInvalida()
    }
    opciones.tipo = query.tipo
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

const crearDatosMovimiento = (body, campoCantidad, minimo) => {
  const campos = new Set(['variante_id', campoCantidad, 'motivo'])
  validarCampos(body, campos)

  return {
    variante_id: validarUuid(body.variante_id),
    [campoCantidad]: validarEnteroBody(body[campoCantidad], minimo),
    motivo: normalizarMotivo(body.motivo),
  }
}

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  22003: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'La variante solicitada no existe' },
  23514: {
    estado: 409,
    mensaje: 'No fue posible aplicar la operación al inventario',
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({ ok: false, message: MENSAJE_SOLICITUD_INVALIDA })
  }

  if (error instanceof ErrorServicioInventario) {
    const respuesta = respuestasPorCodigo[error.codigo]
    if (respuesta) {
      return res
        .status(respuesta.estado)
        .json({ ok: false, message: respuesta.mensaje })
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

export async function listarInventario(req, res) {
  try {
    const resultado = await listarInventarioServicio(
      req.autenticacion?.token,
      crearOpcionesInventario(req.query),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarMovimientos(req, res) {
  try {
    const resultado = await listarMovimientosServicio(
      req.autenticacion?.token,
      crearOpcionesMovimientos(req.query),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function registrarEntrada(req, res) {
  try {
    const resultado = await registrarEntradaServicio(
      req.autenticacion?.token,
      crearDatosMovimiento(req.body, 'cantidad_manojos', 1),
    )
    emitirAlertaStockBajo(resultado)
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function registrarSalida(req, res) {
  try {
    const resultado = await registrarSalidaServicio(
      req.autenticacion?.token,
      crearDatosMovimiento(req.body, 'cantidad_manojos', 1),
    )
    emitirAlertaStockBajo(resultado)
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function registrarAjuste(req, res) {
  try {
    const resultado = await registrarAjusteServicio(
      req.autenticacion?.token,
      crearDatosMovimiento(req.body, 'conteo_fisico_manojos', 0),
    )
    emitirAlertaStockBajo(resultado)
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

function emitirAlertaStockBajo(resultado) {
  const existencia = resultado?.existencia
  const stock = Number(existencia?.stock_manojos)
  const minimo = Number(existencia?.stock_minimo_manojos)

  if (
    !existencia ||
    !Number.isFinite(stock) ||
    !Number.isFinite(minimo) ||
    stock > minimo
  ) {
    return
  }

  emitirAlertaSinBloquear({
    tipo: 'inventario.stock_bajo',
    severidad: stock === 0 ? 'critical' : 'warning',
    titulo: stock === 0 ? 'Producto sin stock' : 'Stock por debajo del mínimo',
    mensaje: 'Una variante alcanzó o quedó por debajo del stock mínimo configurado.',
    contexto: {
      variante_id: existencia.variante_id,
      stock_manojos: existencia.stock_manojos,
      stock_minimo_manojos: existencia.stock_minimo_manojos,
    },
    claveDeduplicacion: `inventario.stock_bajo:${existencia.variante_id}`,
  })
}

export async function actualizarStockMinimo(req, res) {
  try {
    validarUuid(req.params.varianteId)
    validarCampos(req.body, new Set(['stock_minimo_manojos']))
    const stockMinimo = validarEnteroBody(req.body.stock_minimo_manojos, 0)
    const resultado = await actualizarStockMinimoServicio(
      req.autenticacion?.token,
      req.params.varianteId,
      stockMinimo,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
