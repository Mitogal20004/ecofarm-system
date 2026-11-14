import { obtenerSesion } from './auth'

const apiUrl = import.meta.env.VITE_API_URL
const PREFIJOS_OPERACIONES_PENDIENTES = [
  'efarm:caja:apertura-pendiente',
  'efarm:caja:cierre-pendiente',
  'efarm:caja:devolucion-pendiente',
]
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorCaja extends Error {
  constructor(mensaje, status = null, resultadoIncierto = false) {
    super(mensaje)
    this.name = 'ErrorCaja'
    this.status = status
    this.resultadoIncierto = resultadoIncierto
  }
}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const esUuid = (valor) => typeof valor === 'string' && PATRON_UUID.test(valor)

const esDecimalSerializado = (valor) =>
  (typeof valor === 'number' && Number.isFinite(valor)) ||
  (typeof valor === 'string' && PATRON_DECIMAL.test(valor))

const esTextoNoVacio = (valor) =>
  typeof valor === 'string' && valor.trim().length > 0

const esFechaHora = (valor) =>
  typeof valor === 'string' && !Number.isNaN(Date.parse(valor))

const validarDetalleEstadoDevolucion = (devolucion) =>
  esObjeto(devolucion) &&
  esUuid(devolucion.id) &&
  esUuid(devolucion.caja_turno_id) &&
  esDecimalSerializado(devolucion.importe_devuelto) &&
  esUuid(devolucion.usuario_id) &&
  esTextoNoVacio(devolucion.motivo) &&
  esFechaHora(devolucion.fecha_movimiento)

const validarDetalleRegistroDevolucion = (devolucion, ventaId) =>
  esObjeto(devolucion) &&
  esUuid(devolucion.id) &&
  devolucion.venta_id === ventaId &&
  esUuid(devolucion.caja_turno_id) &&
  esDecimalSerializado(devolucion.importe_devuelto) &&
  esDecimalSerializado(devolucion.variacion_efectivo) &&
  esUuid(devolucion.usuario_id) &&
  esTextoNoVacio(devolucion.motivo) &&
  esFechaHora(devolucion.fecha_movimiento)

const validarEstadoDevolucion = (resultado, ventaId) => {
  const sinDevolucion =
    resultado?.devolucion_registrada === false &&
    resultado?.devolucion === null
  const conDevolucion =
    resultado?.devolucion_registrada === true &&
    validarDetalleEstadoDevolucion(resultado?.devolucion)

  return (
    esObjeto(resultado) &&
    resultado.venta_id === ventaId &&
    ['confirmada', 'anulada'].includes(resultado.estado_venta) &&
    esDecimalSerializado(resultado.total) &&
    typeof resultado.tiene_ingreso_caja === 'boolean' &&
    (sinDevolucion || conDevolucion)
  )
}

const crearErrorAbortado = () => {
  const error = new Error('La operación fue cancelada.')
  error.name = 'AbortError'
  return error
}

const comprobarSolicitudActiva = (signal) => {
  if (signal?.aborted) throw crearErrorAbortado()
}

const obtenerToken = async (usuarioEsperadoId = null, signal = null) => {
  comprobarSolicitudActiva(signal)
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorCaja('No fue posible comprobar la sesión.')
  }

  comprobarSolicitudActiva(signal)

  if (!sesion?.access_token) {
    throw new ErrorCaja('La sesión no es válida.', 401)
  }

  if (
    usuarioEsperadoId &&
    sesion.user?.id !== usuarioEsperadoId
  ) {
    throw new ErrorCaja(
      'La sesión cambió. Vuelve a iniciar la operación.',
      409,
    )
  }

  return sesion.access_token
}

const solicitarConToken = async (
  token,
  ruta,
  { operacionIdempotente = false, ...opciones } = {},
) => {
  comprobarSolicitudActiva(opciones.signal)
  let respuesta

  try {
    respuesta = await fetch(`${apiUrl}${ruta}`, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...opciones.headers,
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ErrorCaja(
      'No fue posible conectar con el servidor.',
      null,
      operacionIdempotente,
    )
  }

  let cuerpo = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    if (respuesta.ok) {
      throw new ErrorCaja(
        'El servidor devolvió una respuesta inválida.',
        respuesta.status,
        operacionIdempotente,
      )
    }
  }

  if (!respuesta.ok) {
    const estadoConocido = [400, 401, 403, 404, 409].includes(
      respuesta.status,
    )
    throw new ErrorCaja(
      typeof cuerpo?.message === 'string'
        ? cuerpo.message
        : 'No fue posible completar la operación de caja.',
      respuesta.status,
      operacionIdempotente && !estadoConocido,
    )
  }

  return cuerpo
}

const solicitar = async (
  ruta,
  {
    operacionIdempotente = false,
    usuarioEsperadoId = null,
    ...opciones
  } = {},
) => {
  const token = await obtenerToken(usuarioEsperadoId, opciones.signal)
  return solicitarConToken(token, ruta, {
    ...opciones,
    operacionIdempotente,
  })
}

const validarPaginacion = (paginacion) =>
  esObjeto(paginacion) &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

const errorFormato = (resultadoIncierto = false) =>
  new ErrorCaja(
    'El servidor devolvió una respuesta inválida.',
    null,
    resultadoIncierto,
  )

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

export function crearClaveIdempotencia() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new ErrorCaja('El navegador no permite generar una clave segura.')
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hexadecimal = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join('-')
}

export function limpiarOperacionesPendientesCaja() {
  try {
    const claves = []

    for (let indice = 0; indice < window.sessionStorage.length; indice += 1) {
      const clave = window.sessionStorage.key(indice)
      if (
        clave &&
        PREFIJOS_OPERACIONES_PENDIENTES.some(
          (prefijo) => clave === prefijo || clave.startsWith(`${prefijo}:`),
        )
      ) {
        claves.push(clave)
      }
    }

    claves.forEach((clave) => window.sessionStorage.removeItem(clave))
  } catch {
    // La ausencia de sessionStorage no debe impedir el cierre de sesión.
  }
}

export async function abrirCaja(fondoInicial, claveIdempotencia) {
  const resultado = await solicitar('/api/caja/abrir', {
    method: 'POST',
    headers: { 'Idempotency-Key': claveIdempotencia },
    body: JSON.stringify({ fondo_inicial: fondoInicial }),
    operacionIdempotente: true,
  })

  if (
    typeof resultado?.cambio !== 'boolean' ||
    !esObjeto(resultado.caja)
  ) {
    throw errorFormato(true)
  }

  return resultado
}

export async function obtenerCajaActual(configuracion = {}) {
  const resultado = await solicitar('/api/caja/actual', configuracion)
  const sinCaja = resultado?.caja === null && resultado?.resumen === null
  const conCaja = esObjeto(resultado?.caja) && esObjeto(resultado?.resumen)

  if (!esObjeto(resultado) || (!sinCaja && !conCaja)) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerResumenCajaActual(configuracion = {}) {
  const resultado = await solicitar(
    '/api/caja/actual/resumen',
    configuracion,
  )
  const sinCaja = resultado?.caja_id === null && resultado?.resumen === null
  const conCaja =
    typeof resultado?.caja_id === 'string' && esObjeto(resultado?.resumen)

  if (!esObjeto(resultado) || (!sinCaja && !conCaja)) {
    throw errorFormato()
  }

  return resultado
}

export async function cerrarCaja(
  cajaId,
  datos,
  claveIdempotencia,
) {
  const resultado = await solicitar(
    `/api/caja/${encodeURIComponent(cajaId)}/cerrar`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': claveIdempotencia },
      body: JSON.stringify(datos),
      operacionIdempotente: true,
    },
  )

  if (
    typeof resultado?.cambio !== 'boolean' ||
    !esObjeto(resultado.caja)
  ) {
    throw errorFormato(true)
  }

  return resultado
}

export async function listarCajas(opciones = {}, configuracion = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'fecha_desde', opciones.fecha_desde)
  agregarParametro(parametros, 'fecha_hasta', opciones.fecha_hasta)
  agregarParametro(parametros, 'usuario_id', opciones.usuario_id)
  agregarParametro(parametros, 'estado', opciones.estado)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/caja${consulta ? `?${consulta}` : ''}`,
    configuracion,
  )

  if (
    !Array.isArray(resultado?.cajas) ||
    !validarPaginacion(resultado.paginacion)
  ) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerCaja(cajaId, configuracion = {}) {
  const resultado = await solicitar(
    `/api/caja/${encodeURIComponent(cajaId)}`,
    configuracion,
  )

  if (!esObjeto(resultado?.caja) || !esObjeto(resultado?.resumen)) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerEstadoDevolucionVenta(
  ventaId,
  configuracion = {},
) {
  const resultado = await solicitar(
    `/api/caja/ventas/${encodeURIComponent(ventaId)}/devolucion`,
    configuracion,
  )

  if (!validarEstadoDevolucion(resultado, ventaId)) {
    throw errorFormato()
  }

  return resultado
}

const obtenerEstadoDevolucionConToken = async (
  token,
  ventaId,
  configuracion = {},
) => {
  const resultado = await solicitarConToken(
    token,
    `/api/caja/ventas/${encodeURIComponent(ventaId)}/devolucion`,
    configuracion,
  )

  if (!validarEstadoDevolucion(resultado, ventaId)) {
    throw errorFormato()
  }

  return resultado
}

const registrarDevolucionConToken = async (
  token,
  ventaId,
  motivo,
  claveIdempotencia,
  configuracion = {},
) => {
  const { signal } = configuracion
  const resultado = await solicitarConToken(
    token,
    `/api/caja/ventas/${encodeURIComponent(ventaId)}/devolucion`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': claveIdempotencia },
      body: JSON.stringify({ motivo }),
      operacionIdempotente: true,
      signal,
    },
  )

  if (
    !esObjeto(resultado) ||
    typeof resultado.cambio !== 'boolean' ||
    !validarDetalleRegistroDevolucion(resultado.devolucion, ventaId)
  ) {
    throw errorFormato(true)
  }

  return resultado
}

export async function crearContextoDevolucion(
  usuarioEsperadoId,
  configuracion = {},
) {
  if (!esUuid(usuarioEsperadoId)) {
    throw new ErrorCaja(
      'No fue posible vincular la operación con el usuario actual.',
      409,
    )
  }

  const { signal } = configuracion
  const tokenOriginal = await obtenerToken(usuarioEsperadoId, signal)

  const comprobarSesionOriginal = async (signalOperacion) => {
    const tokenActual = await obtenerToken(
      usuarioEsperadoId,
      signalOperacion,
    )
    if (tokenActual !== tokenOriginal) {
      throw new ErrorCaja(
        'La sesión cambió. Vuelve a iniciar la operación.',
        409,
      )
    }
  }

  return Object.freeze({
    obtenerEstado: (ventaId, opciones = {}) =>
      obtenerEstadoDevolucionConToken(tokenOriginal, ventaId, opciones),
    async registrar(ventaId, motivo, claveIdempotencia, opciones = {}) {
      await comprobarSesionOriginal(opciones.signal)
      comprobarSolicitudActiva(opciones.signal)
      opciones.antesDeEnviar?.()
      comprobarSolicitudActiva(opciones.signal)
      const resultado = await registrarDevolucionConToken(
        tokenOriginal,
        ventaId,
        motivo,
        claveIdempotencia,
        { signal: opciones.signal },
      )

      try {
        await comprobarSesionOriginal(opciones.signal)
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throw new ErrorCaja(
          'No se pudo confirmar el resultado con la sesión original.',
          null,
          true,
        )
      }

      return resultado
    },
  })
}
