import {
  ErrorConsultaAutorizacion,
  obtenerAutorizacionUsuario,
} from '../services/autorizacion.service.js'

const responderAutorizacionNoCargada = (res) =>
  res.status(500).json({
    ok: false,
    message: 'No fue posible verificar la autorización del usuario',
  })

export async function cargarAutorizacion(req, res, next) {
  const token = req.autenticacion?.token

  if (typeof token !== 'string' || !token) {
    return responderAutorizacionNoCargada(res)
  }

  try {
    const autorizacion = await obtenerAutorizacionUsuario(token)

    if (!autorizacion.perfil) {
      return res.status(403).json({
        ok: false,
        message: 'El usuario no tiene un perfil habilitado',
      })
    }

    if (autorizacion.perfil.activo !== true) {
      return res.status(403).json({
        ok: false,
        message: 'El perfil del usuario está inactivo',
      })
    }

    req.autorizacion = autorizacion
    return next()
  } catch (error) {
    if (error instanceof ErrorConsultaAutorizacion) {
      return res.status(503).json({
        ok: false,
        message: 'El servicio de autorización no está disponible',
      })
    }

    return responderAutorizacionNoCargada(res)
  }
}

export function requerirPermiso(codigoPermiso) {
  if (
    typeof codigoPermiso !== 'string' ||
    !codigoPermiso ||
    codigoPermiso.trim() !== codigoPermiso
  ) {
    throw new TypeError('Se requiere un código de permiso válido.')
  }

  return function verificarPermiso(req, res, next) {
    if (!req.autorizacion) {
      return responderAutorizacionNoCargada(res)
    }

    const tienePermiso =
      Array.isArray(req.autorizacion.permisos) &&
      req.autorizacion.permisos.some(
        (permiso) => permiso?.codigo === codigoPermiso,
      )

    if (!tienePermiso) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permiso para realizar esta acción',
      })
    }

    return next()
  }
}
