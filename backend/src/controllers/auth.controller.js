import {
  ErrorCredencialesInvalidas,
  ErrorServicioAutenticacion,
  iniciarSesionConNombreUsuario,
} from '../services/auth.service.js'

const PATRON_NOMBRE_USUARIO =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const responderSolicitudInvalida = (res) =>
  res.status(400).json({
    ok: false,
    message: 'La solicitud contiene datos inválidos',
  })

export async function iniciarSesion(req, res) {
  try {
    if (!esObjeto(req.body)) {
      return responderSolicitudInvalida(res)
    }

    const claves = Object.keys(req.body)

    if (
      claves.some(
        (clave) => !['nombre_usuario', 'password'].includes(clave),
      ) ||
      !Object.prototype.hasOwnProperty.call(req.body, 'nombre_usuario') ||
      !Object.prototype.hasOwnProperty.call(req.body, 'password')
    ) {
      return responderSolicitudInvalida(res)
    }

    if (
      typeof req.body.nombre_usuario !== 'string' ||
      typeof req.body.password !== 'string'
    ) {
      return responderSolicitudInvalida(res)
    }

    const nombreUsuario = req.body.nombre_usuario.trim().toLowerCase()
    const { password } = req.body

    if (
      nombreUsuario.length < 3 ||
      nombreUsuario.length > 50 ||
      !PATRON_NOMBRE_USUARIO.test(nombreUsuario) ||
      password.length < 1 ||
      password.length > 1024
    ) {
      return responderSolicitudInvalida(res)
    }

    const resultado = await iniciarSesionConNombreUsuario(
      nombreUsuario,
      password,
    )

    return res.status(200).json({
      ok: true,
      ...resultado,
    })
  } catch (error) {
    if (error instanceof ErrorCredencialesInvalidas) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos.',
      })
    }

    if (error instanceof ErrorServicioAutenticacion) {
      return res.status(500).json({
        ok: false,
        message: 'No fue posible iniciar sesión. Intenta nuevamente.',
      })
    }

    return res.status(500).json({
      ok: false,
      message: 'No fue posible iniciar sesión. Intenta nuevamente.',
    })
  }
}
