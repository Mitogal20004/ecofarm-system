import {
  ErrorServicioUsuarios,
  actualizarPerfilUsuario as actualizarPerfilUsuarioServicio,
  listarUsuarios as listarUsuariosServicio,
  obtenerDetalleUsuario as obtenerDetalleUsuarioServicio,
  reemplazarRolesUsuario as reemplazarRolesUsuarioServicio,
} from '../services/usuarios.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return responderSolicitudInvalida(res)
  }

  if (error instanceof ErrorServicioUsuarios) {
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

    const resultado = await actualizarPerfilUsuarioServicio(
      req.autenticacion?.token,
      usuarioId,
      req.body,
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
