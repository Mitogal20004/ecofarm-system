import { randomUUID } from 'node:crypto'

const convertirNumeroPositivo = (valor, respaldo) => {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? numero : respaldo
}

const VENTANA_LOGIN_MS = convertirNumeroPositivo(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
)
const MAX_INTENTOS_LOGIN = convertirNumeroPositivo(
  process.env.LOGIN_RATE_LIMIT_MAX,
  10,
)
const intentosLogin = new Map()

function obtenerClaveIp(req) {
  return req.ip || req.socket.remoteAddress || 'ip-desconocida'
}

function limpiarIntentosExpirados(ahora) {
  for (const [clave, registro] of intentosLogin) {
    if (registro.expiraEn <= ahora) intentosLogin.delete(clave)
  }
}

export function agregarIdentidadSolicitud(req, res, next) {
  const id = randomUUID()
  req.idSolicitud = id
  res.setHeader('X-Request-Id', id)
  next()
}

export function agregarCabecerasSeguras(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
  }

  next()
}

export function limitarIntentosLogin(req, res, next) {
  const ahora = Date.now()
  limpiarIntentosExpirados(ahora)

  const clave = obtenerClaveIp(req)
  const registro = intentosLogin.get(clave) || {
    cantidad: 0,
    expiraEn: ahora + VENTANA_LOGIN_MS,
  }

  if (registro.cantidad >= MAX_INTENTOS_LOGIN) {
    const espera = Math.max(1, Math.ceil((registro.expiraEn - ahora) / 1000))
    res.setHeader('Retry-After', String(espera))
    return res.status(429).json({
      ok: false,
      message: 'Demasiados intentos. Intenta nuevamente más tarde.',
    })
  }

  registro.cantidad += 1
  intentosLogin.set(clave, registro)

  // Evita que un atacante consuma memoria usando muchas IP de origen.
  if (intentosLogin.size > 10000) {
    intentosLogin.delete(intentosLogin.keys().next().value)
  }

  return next()
}

export function rechazarHttpInseguro(req, res, next) {
  if (
    process.env.NODE_ENV === 'production' &&
    !req.secure
  ) {
    return res.status(400).json({
      ok: false,
      message: 'La conexión segura es obligatoria.',
    })
  }

  return next()
}
