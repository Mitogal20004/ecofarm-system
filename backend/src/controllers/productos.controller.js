import {
  ErrorServicioProductos,
  actualizarVariante as actualizarVarianteServicio,
  crearVariante as crearVarianteServicio,
  listarHistorialPrecios as listarHistorialPreciosServicio,
  listarPresentaciones as listarPresentacionesServicio,
  listarVariantes as listarVariantesServicio,
  obtenerDetalleVariante as obtenerDetalleVarianteServicio,
  obtenerPreciosVigentes as obtenerPreciosVigentesServicio,
  registrarPrecio as registrarPrecioServicio,
} from '../services/productos.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_SKU = /^[A-Z0-9][A-Z0-9._-]*[A-Z0-9]$/
const CLASIFICACIONES = new Set(['normal', 'completa', 'premium'])
const CAMPOS_VARIANTE = new Set([
  'codigo_sku',
  'color',
  'longitud_cm',
  'clasificacion',
  'observaciones',
])
const CAMPOS_ACTUALIZACION = new Set([...CAMPOS_VARIANTE, 'activo'])

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const normalizarEspacios = (valor) => valor.trim().replace(/\s+/g, ' ')

const validarUuid = (valor) => {
  if (typeof valor !== 'string' || !PATRON_UUID.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }
}

const convertirEnteroPositivo = (valor) => {
  const numero = typeof valor === 'number' ? valor : Number(valor)

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const validarCampos = (body, camposPermitidos) => {
  if (!esObjeto(body)) throw new ErrorSolicitudInvalida()

  const campos = Object.keys(body)

  if (
    campos.length === 0 ||
    campos.some((campo) => !camposPermitidos.has(campo))
  ) {
    throw new ErrorSolicitudInvalida()
  }
}

const normalizarSku = (valor) => {
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()
  const sku = valor.trim().toUpperCase()

  if (sku.length < 3 || sku.length > 80 || !PATRON_SKU.test(sku)) {
    throw new ErrorSolicitudInvalida()
  }

  return sku
}

const normalizarColor = (valor) => {
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()
  const color = normalizarEspacios(valor)

  if (!color || color.length > 80) throw new ErrorSolicitudInvalida()
  return color
}

const normalizarClasificacion = (valor) => {
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()
  const clasificacion = valor.trim().toLowerCase()

  if (!CLASIFICACIONES.has(clasificacion)) {
    throw new ErrorSolicitudInvalida()
  }

  return clasificacion
}

const normalizarObservaciones = (valor) => {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw new ErrorSolicitudInvalida()
  const observaciones = valor.trim()

  if (observaciones.length > 500) throw new ErrorSolicitudInvalida()
  return observaciones || null
}

const crearDatosVariante = (body) => {
  validarCampos(body, CAMPOS_VARIANTE)

  for (const campo of ['codigo_sku', 'color', 'longitud_cm', 'clasificacion']) {
    if (!Object.prototype.hasOwnProperty.call(body, campo)) {
      throw new ErrorSolicitudInvalida()
    }
  }

  return {
    codigo_sku: normalizarSku(body.codigo_sku),
    color: normalizarColor(body.color),
    longitud_cm: convertirEnteroPositivo(body.longitud_cm),
    clasificacion: normalizarClasificacion(body.clasificacion),
    observaciones: normalizarObservaciones(body.observaciones),
  }
}

const crearCambiosVariante = (body) => {
  validarCampos(body, CAMPOS_ACTUALIZACION)
  const cambios = {}

  for (const [campo, valor] of Object.entries(body)) {
    if (campo === 'codigo_sku') cambios.codigo_sku = normalizarSku(valor)
    else if (campo === 'color') cambios.color = normalizarColor(valor)
    else if (campo === 'longitud_cm') {
      cambios.longitud_cm = convertirEnteroPositivo(valor)
    } else if (campo === 'clasificacion') {
      cambios.clasificacion = normalizarClasificacion(valor)
    } else if (campo === 'observaciones') {
      cambios.observaciones = normalizarObservaciones(valor)
    } else if (campo === 'activo') {
      if (typeof valor !== 'boolean') throw new ErrorSolicitudInvalida()
      cambios.activo = valor
    }
  }

  return cambios
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
  if (query.longitud_cm !== undefined) {
    opciones.longitudCm = convertirEnteroPositivo(query.longitud_cm)
  }
  if (query.clasificacion !== undefined) {
    opciones.clasificacion = normalizarClasificacion(query.clasificacion)
  }
  if (query.activo !== undefined) {
    if (query.activo === 'true') opciones.activo = true
    else if (query.activo === 'false') opciones.activo = false
    else throw new ErrorSolicitudInvalida()
  }

  return opciones
}

const validarPrecio = (valor) => {
  if (
    typeof valor !== 'number' ||
    !Number.isFinite(valor) ||
    valor <= 0 ||
    valor > 9999999999.99 ||
    Number(valor.toFixed(2)) !== valor
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
}

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'El recurso solicitado no existe' },
  23505: { estado: 409, mensaje: 'Ya existe una variante con esos datos' },
  23514: {
    estado: 409,
    mensaje: 'La operación solicitada no puede realizarse',
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({ ok: false, message: MENSAJE_SOLICITUD_INVALIDA })
  }

  if (error instanceof ErrorServicioProductos) {
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

export async function listarVariantes(req, res) {
  try {
    const resultado = await listarVariantesServicio(
      req.autenticacion?.token,
      crearOpcionesListado(req.query),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarPresentaciones(req, res) {
  try {
    const resultado = await listarPresentacionesServicio(
      req.autenticacion?.token,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerDetalleVariante(req, res) {
  try {
    validarUuid(req.params.varianteId)
    const resultado = await obtenerDetalleVarianteServicio(
      req.autenticacion?.token,
      req.params.varianteId,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function crearVariante(req, res) {
  try {
    const resultado = await crearVarianteServicio(
      req.autenticacion?.token,
      crearDatosVariante(req.body),
    )
    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function actualizarVariante(req, res) {
  try {
    validarUuid(req.params.varianteId)
    const resultado = await actualizarVarianteServicio(
      req.autenticacion?.token,
      req.params.varianteId,
      crearCambiosVariante(req.body),
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerPreciosVigentes(req, res) {
  try {
    validarUuid(req.params.varianteId)
    const resultado = await obtenerPreciosVigentesServicio(
      req.autenticacion?.token,
      req.params.varianteId,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function registrarPrecio(req, res) {
  try {
    validarUuid(req.params.varianteId)
    validarCampos(req.body, new Set(['presentacion_id', 'precio']))

    if (
      !Object.prototype.hasOwnProperty.call(req.body, 'presentacion_id') ||
      !Object.prototype.hasOwnProperty.call(req.body, 'precio')
    ) {
      throw new ErrorSolicitudInvalida()
    }

    validarUuid(req.body.presentacion_id)
    const resultado = await registrarPrecioServicio(
      req.autenticacion?.token,
      req.params.varianteId,
      {
        presentacion_id: req.body.presentacion_id,
        precio: validarPrecio(req.body.precio),
      },
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarHistorialPrecios(req, res) {
  try {
    validarUuid(req.params.varianteId)
    let presentacionId

    if (req.query.presentacion_id !== undefined) {
      validarUuid(req.query.presentacion_id)
      presentacionId = req.query.presentacion_id
    }

    const resultado = await listarHistorialPreciosServicio(
      req.autenticacion?.token,
      req.params.varianteId,
      presentacionId,
    )
    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
