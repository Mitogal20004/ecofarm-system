import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorCotizaciones extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorCotizaciones'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorCotizaciones('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorCotizaciones('La sesión no es válida.', 401)
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
    throw new ErrorCotizaciones('No fue posible conectar con el servidor.')
  }

  let cuerpo = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    if (respuesta.ok) {
      throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
    }
  }

  if (!respuesta.ok) {
    throw new ErrorCotizaciones(
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

export async function listarCotizaciones(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'estado', opciones.estado)
  agregarParametro(parametros, 'fecha_desde', opciones.fecha_desde)
  agregarParametro(parametros, 'fecha_hasta', opciones.fecha_hasta)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/cotizaciones${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !Array.isArray(resultado?.cotizaciones) ||
    !resultado.paginacion ||
    !Number.isInteger(resultado.paginacion.pagina) ||
    !Number.isInteger(resultado.paginacion.limite) ||
    !Number.isInteger(resultado.paginacion.total) ||
    !Number.isInteger(resultado.paginacion.total_paginas)
  ) {
    throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function obtenerCotizacion(cotizacionId) {
  const resultado = await solicitar(
    `/api/cotizaciones/${encodeURIComponent(cotizacionId)}`,
  )

  if (!resultado?.cotizacion || !Array.isArray(resultado.detalles)) {
    throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function crearCotizacion(datos) {
  const resultado = await solicitar('/api/cotizaciones', {
    method: 'POST',
    body: JSON.stringify(datos),
  })

  if (!resultado?.cotizacion) {
    throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function actualizarCotizacion(cotizacionId, datos) {
  const resultado = await solicitar(
    `/api/cotizaciones/${encodeURIComponent(cotizacionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(datos),
    },
  )

  if (!resultado?.cotizacion) {
    throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function cambiarEstadoCotizacion(cotizacionId, estado) {
  const resultado = await solicitar(
    `/api/cotizaciones/${encodeURIComponent(cotizacionId)}/estado`,
    {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    },
  )

  if (!resultado?.cotizacion || typeof resultado.cambio !== 'boolean') {
    throw new ErrorCotizaciones('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}
