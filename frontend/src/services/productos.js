import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorProductos extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorProductos'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorProductos('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorProductos('La sesión no es válida.', 401)
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
    throw new ErrorProductos('No fue posible conectar con el servidor.')
  }

  if (!respuesta.ok) {
    throw new ErrorProductos(
      'No fue posible completar la operación.',
      [400, 401, 403, 404, 409].includes(respuesta.status)
        ? respuesta.status
        : null,
    )
  }

  try {
    return await respuesta.json()
  } catch {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }
}

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

export async function listarVariantes(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'longitud_cm', opciones.longitud_cm)
  agregarParametro(parametros, 'clasificacion', opciones.clasificacion)
  agregarParametro(parametros, 'activo', opciones.activo)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/productos${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !resultado?.producto ||
    !Array.isArray(resultado.variantes) ||
    !resultado.paginacion ||
    !Number.isInteger(resultado.paginacion.pagina) ||
    !Number.isInteger(resultado.paginacion.limite) ||
    !Number.isInteger(resultado.paginacion.total) ||
    !Number.isInteger(resultado.paginacion.total_paginas)
  ) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function listarPresentaciones() {
  const resultado = await solicitar('/api/productos/presentaciones')

  if (!Array.isArray(resultado?.presentaciones)) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado.presentaciones
}

export async function obtenerDetalleVariante(varianteId) {
  const resultado = await solicitar(
    `/api/productos/variantes/${encodeURIComponent(varianteId)}`,
  )

  if (
    !resultado?.producto ||
    !resultado?.variante ||
    !Array.isArray(resultado.precios)
  ) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function crearVariante(datos) {
  const resultado = await solicitar('/api/productos/variantes', {
    method: 'POST',
    body: JSON.stringify(datos),
  })

  if (!resultado?.variante) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function actualizarVariante(varianteId, cambios) {
  const resultado = await solicitar(
    `/api/productos/variantes/${encodeURIComponent(varianteId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    },
  )

  if (!resultado?.variante) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function registrarPrecio(varianteId, datos) {
  const resultado = await solicitar(
    `/api/productos/variantes/${encodeURIComponent(varianteId)}/precios`,
    {
      method: 'POST',
      body: JSON.stringify(datos),
    },
  )

  if (!resultado?.precio || typeof resultado.cambio !== 'boolean') {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function listarHistorialPrecios(varianteId, presentacionId) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'presentacion_id', presentacionId)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/productos/variantes/${encodeURIComponent(varianteId)}/precios/historial${
      consulta ? `?${consulta}` : ''
    }`,
  )

  if (!Array.isArray(resultado?.historial)) {
    throw new ErrorProductos('El servidor devolvió una respuesta inválida.')
  }

  return resultado.historial
}
