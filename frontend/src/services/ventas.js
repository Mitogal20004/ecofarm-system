import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorVentas extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorVentas'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorVentas('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorVentas('La sesión no es válida.', 401)
  }

  return sesion.access_token
}

const solicitar = async (ruta, opciones = {}) => {
  const token = await obtenerToken()
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
  } catch {
    throw new ErrorVentas('No fue posible conectar con el servidor.')
  }

  let cuerpo = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    if (respuesta.ok) {
      throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
    }
  }

  if (!respuesta.ok) {
    throw new ErrorVentas(
      typeof cuerpo?.message === 'string'
        ? cuerpo.message
        : 'No fue posible completar la operación.',
      [400, 401, 403, 404, 409].includes(respuesta.status)
        ? respuesta.status
        : null,
    )
  }

  return cuerpo
}

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

export async function crearIntencionVenta() {
  const resultado = await solicitar('/api/ventas/intenciones', {
    method: 'POST',
  })

  if (typeof resultado?.clave_idempotencia !== 'string') {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado.clave_idempotencia
}

export async function crearPagoStripe(montoGtq, claveIdempotencia) {
  const resultado = await solicitar('/api/ventas/pagos/stripe-intent', {
    method: 'POST',
    headers: { 'Idempotency-Key': claveIdempotencia },
    body: JSON.stringify({ monto_gtq: montoGtq }),
  })

  if (
    typeof resultado?.client_secret !== 'string' ||
    typeof resultado?.payment_intent_id !== 'string'
  ) {
    throw new ErrorVentas('El servidor no pudo preparar el pago con tarjeta.')
  }

  return resultado
}

export async function listarVentas(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'estado', opciones.estado)
  agregarParametro(parametros, 'tipo_documento', opciones.tipo_documento)
  agregarParametro(parametros, 'fecha_desde', opciones.fecha_desde)
  agregarParametro(parametros, 'fecha_hasta', opciones.fecha_hasta)
  agregarParametro(parametros, 'usuario_id', opciones.usuario_id)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/ventas${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !Array.isArray(resultado?.ventas) ||
    !resultado.paginacion ||
    !Number.isInteger(resultado.paginacion.pagina) ||
    !Number.isInteger(resultado.paginacion.limite) ||
    !Number.isInteger(resultado.paginacion.total) ||
    !Number.isInteger(resultado.paginacion.total_paginas)
  ) {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function obtenerVenta(ventaId) {
  const resultado = await solicitar(
    `/api/ventas/${encodeURIComponent(ventaId)}`,
  )

  if (
    !resultado?.venta ||
    !Array.isArray(resultado.detalles) ||
    !Array.isArray(resultado.movimientos_inventario) ||
    !Array.isArray(resultado.consumos_lotes)
  ) {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function confirmarVenta(datos, claveIdempotencia) {
  const resultado = await solicitar('/api/ventas', {
    method: 'POST',
    headers: { 'Idempotency-Key': claveIdempotencia },
    body: JSON.stringify(datos),
  })

  if (
    !resultado?.venta ||
    !resultado?.recibo ||
    typeof resultado.cambio !== 'boolean'
  ) {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function confirmarVentaCredito(datos, claveIdempotencia) {
  const resultado = await solicitar('/api/ventas/credito', {
    method: 'POST',
    headers: { 'Idempotency-Key': claveIdempotencia },
    body: JSON.stringify(datos),
  })

  if (!resultado?.venta || !resultado?.recibo || typeof resultado.cambio !== 'boolean') {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function convertirCotizacionVenta(cotizacionId, montoRecibido) {
  const resultado = await solicitar(
    `/api/ventas/desde-cotizacion/${encodeURIComponent(cotizacionId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ monto_recibido: montoRecibido }),
    },
  )

  if (!resultado?.venta || !resultado?.recibo) {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function convertirCotizacionVentaCredito(cotizacionId, montoRecibido) {
  const resultado = await solicitar(
    `/api/ventas/credito/desde-cotizacion/${encodeURIComponent(cotizacionId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ monto_recibido: montoRecibido }),
    },
  )

  if (!resultado?.venta || !resultado?.recibo) {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function generarReciboVenta(ventaId) {
  const resultado = await solicitar(
    `/api/ventas/${encodeURIComponent(ventaId)}/recibo`,
    { method: 'POST' },
  )

  if (!resultado?.recibo || typeof resultado.cambio !== 'boolean') {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function anularVenta(ventaId, motivo) {
  const resultado = await solicitar(
    `/api/ventas/${encodeURIComponent(ventaId)}/anular`,
    {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    },
  )

  if (!resultado?.venta || typeof resultado.cambio !== 'boolean') {
    throw new ErrorVentas('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}
