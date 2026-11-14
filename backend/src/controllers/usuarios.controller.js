import {
  ErrorServicioUsuarios,
  actualizarPerfilUsuario as actualizarPerfilUsuarioServicio,
  crearUsuario as crearUsuarioServicio,
  listarUsuarios as listarUsuariosServicio,
  obtenerDetalleUsuario as obtenerDetalleUsuarioServicio,
  reemplazarRolesUsuario as reemplazarRolesUsuarioServicio,
} from '../services/usuarios.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_NOMBRE_USUARIO =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATRON_SERIE_DOCUMENTOS = /^[A-Z0-9]{1,8}$/
const CAMPOS_CREACION_USUARIO = new Set([
  'nombre_completo',
  'nombre_usuario',
  'email',
  'telefono',
  'serie_documentos',
  'password',
  'rol_id',
])
const CAMPOS_OBLIGATORIOS_CREACION = [
  'nombre_completo',
  'nombre_usuario',
  'email',
  'password',
  'rol_id',
]

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const convertirEnteroPositivo = (valor) => {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const numero = Number(valor)

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const validarUsuarioId = (usuarioId) => {
  if (typeof usuarioId !== 'string' || !PATRON_UUID.test(usuarioId)) {
    throw new ErrorSolicitudInvalida()
  }
}

const responderSolicitudInvalida = (res) =>
  res.status(400).json({
    ok: false,
    message: MENSAJE_SOLICITUD_INVALIDA,
  })

const respuestasPorCodigo = {
  42501: {
    estado: 403,
    mensaje: 'No tiene permiso para realizar esta acción',
  },
  22023: {
    estado: 400,
    mensaje: MENSAJE_SOLICITUD_INVALIDA,
  },
  P0002: {
    estado: 404,
    mensaje: 'El usuario solicitado no existe',
  },
  23514: {
    estado: 409,
    mensaje: 'La operación solicitada no puede realizarse',
  },
  23505: {
    estado: 409,
    mensaje: 'El correo o nombre de usuario ya está registrado.',
  },
  conflicto_usuario: {
    estado: 409,
    mensaje: 'El correo o nombre de usuario ya está registrado.',
  },
  conflicto_serie_documentos: {
    estado: 409,
    mensaje: 'La serie de documentos ya está asignada a otro usuario.',
    codigo: 'serie_documentos_duplicada',
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return responderSolicitudInvalida(res)
  }

  if (error instanceof ErrorServicioUsuarios) {
    const respuesta = respuestasPorCodigo[error.codigo]

    if (respuesta) {
      const cuerpo = {
        ok: false,
        message: respuesta.mensaje,
      }

      if (respuesta.codigo) {
        cuerpo.code = respuesta.codigo
      }

      return res.status(respuesta.estado).json(cuerpo)
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

const crearOpcionesListado = (query) => {
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroPositivo(query.pagina)
  }

  if (query.limite !== undefined) {
    const limite = convertirEnteroPositivo(query.limite)

    if (limite > 100) {
      throw new ErrorSolicitudInvalida()
    }

    opciones.limite = limite
  }

  if (query.busqueda !== undefined) {
    if (typeof query.busqueda !== 'string') {
      throw new ErrorSolicitudInvalida()
    }

    opciones.busqueda = query.busqueda
  }

  if (query.activo !== undefined) {
    if (query.activo === 'true') {
      opciones.activo = true
    } else if (query.activo === 'false') {
      opciones.activo = false
    } else {
      throw new ErrorSolicitudInvalida()
    }
  }

  return opciones
}

const validarPassword = (password) =>
  password.length >= 8 &&
  password.length <= 1024 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[^A-Za-z0-9\s]/.test(password)

const normalizarSerieDocumentos = (valor) => {
  if (valor === undefined) return undefined
  if (valor === null) return null

  if (typeof valor !== 'string') {
    throw new ErrorSolicitudInvalida()
  }

  const serieDocumentos = valor.trim().toUpperCase()

  if (serieDocumentos === '') return null

  if (!PATRON_SERIE_DOCUMENTOS.test(serieDocumentos)) {
    throw new ErrorSolicitudInvalida()
  }

  return serieDocumentos
}

const crearDatosUsuario = (body) => {
  if (!esObjeto(body)) {
    throw new ErrorSolicitudInvalida()
  }

  const campos = Object.keys(body)

  if (
    campos.some((campo) => !CAMPOS_CREACION_USUARIO.has(campo)) ||
    CAMPOS_OBLIGATORIOS_CREACION.some(
      (campo) => !Object.prototype.hasOwnProperty.call(body, campo),
    )
  ) {
    throw new ErrorSolicitudInvalida()
  }

  if (
    typeof body.nombre_completo !== 'string' ||
    typeof body.nombre_usuario !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.rol_id !== 'string' ||
    (body.telefono !== undefined &&
      body.telefono !== null &&
      typeof body.telefono !== 'string') ||
    (body.serie_documentos !== undefined &&
      body.serie_documentos !== null &&
      typeof body.serie_documentos !== 'string')
  ) {
    throw new ErrorSolicitudInvalida()
  }

  const nombreCompleto = body.nombre_completo.trim()
  const nombreUsuario = body.nombre_usuario.trim().toLowerCase()
  const email = body.email.trim().toLowerCase()
  const telefono = body.telefono?.trim() || null
  const serieDocumentos = normalizarSerieDocumentos(body.serie_documentos)
  const rolId = body.rol_id.trim()

  if (
    nombreCompleto.length < 1 ||
    nombreCompleto.length > 150 ||
    nombreUsuario.length < 3 ||
    nombreUsuario.length > 50 ||
    !PATRON_NOMBRE_USUARIO.test(nombreUsuario) ||
    email.length > 254 ||
    !PATRON_EMAIL.test(email) ||
    (telefono !== null && telefono.length > 30) ||
    !validarPassword(body.password) ||
    !PATRON_UUID.test(rolId)
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return {
    nombre_completo: nombreCompleto,
    nombre_usuario: nombreUsuario,
    email,
    telefono,
    serie_documentos: serieDocumentos ?? null,
    password: body.password,
    rol_id: rolId,
  }
}

export async function crearUsuario(req, res) {
  try {
    const datos = crearDatosUsuario(req.body)
    const resultado = await crearUsuarioServicio(
      req.autenticacion?.token,
      datos,
    )

    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function listarUsuarios(req, res) {
  try {
    const opciones = crearOpcionesListado(req.query)
    const resultado = await listarUsuariosServicio(
      req.autenticacion?.token,
      opciones,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerDetalleUsuario(req, res) {
  try {
    const { usuarioId } = req.params
    validarUsuarioId(usuarioId)

    const resultado = await obtenerDetalleUsuarioServicio(
      req.autenticacion?.token,
      usuarioId,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function actualizarPerfilUsuario(req, res) {
  try {
    const { usuarioId } = req.params
    validarUsuarioId(usuarioId)

    if (!esObjeto(req.body)) {
      throw new ErrorSolicitudInvalida()
    }

    const cambios = { ...req.body }

    if (Object.prototype.hasOwnProperty.call(cambios, 'serie_documentos')) {
      cambios.serie_documentos = normalizarSerieDocumentos(
        cambios.serie_documentos,
      )
    }

    const resultado = await actualizarPerfilUsuarioServicio(
      req.autenticacion?.token,
      usuarioId,
      cambios,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function reemplazarRolesUsuario(req, res) {
  try {
    const { usuarioId } = req.params
    validarUsuarioId(usuarioId)

    if (
      !esObjeto(req.body) ||
      !Object.prototype.hasOwnProperty.call(req.body, 'roles_ids') ||
      !Array.isArray(req.body.roles_ids) ||
      Object.keys(req.body).some((clave) => clave !== 'roles_ids')
    ) {
      throw new ErrorSolicitudInvalida()
    }

    const resultado = await reemplazarRolesUsuarioServicio(
      req.autenticacion?.token,
      usuarioId,
      req.body.roles_ids,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
