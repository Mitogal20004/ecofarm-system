import { obtenerSesion } from './auth'

const apiUrl = import.meta.env.VITE_API_URL

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorReportes extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorReportes'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorReportes('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorReportes('La sesión no es válida.', 401)
  }

  return sesion.access_token
}

const solicitar = async (ruta, { signal } = {}) => {
  const token = await obtenerToken()
  let respuesta

  try {
    respuesta = await fetch(`${apiUrl}${ruta}`, {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ErrorReportes('No fue posible conectar con el servidor.')
  }

  let cuerpo = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    if (respuesta.ok) {
      throw new ErrorReportes('El servidor devolvió una respuesta inválida.')
    }
  }

  if (!respuesta.ok) {
    throw new ErrorReportes(
      typeof cuerpo?.message === 'string'
        ? cuerpo.message
        : 'No fue posible consultar el reporte.',
      [400, 401, 403, 404].includes(respuesta.status)
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

const crearRuta = (ruta, valores) => {
  const parametros = new URLSearchParams()

  Object.entries(valores).forEach(([nombre, valor]) => {
    agregarParametro(parametros, nombre, valor)
  })

  const consulta = parametros.toString()
  return `${ruta}${consulta ? `?${consulta}` : ''}`
}

const validarPaginacion = (paginacion) =>
  paginacion &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

const errorFormato = () =>
  new ErrorReportes('El servidor devolvió una respuesta inválida.')

export async function obtenerReporteVentas(opciones, configuracion = {}) {
  const resultado = await solicitar(
    crearRuta('/api/reportes/ventas', {
      fecha_desde: opciones.fecha_desde,
      fecha_hasta: opciones.fecha_hasta,
      cliente_id: opciones.cliente_id,
      serie: opciones.serie,
      usuario_id: opciones.usuario_id,
    }),
    configuracion,
  )

  if (
    !resultado?.resumen ||
    !Array.isArray(resultado.serie) ||
    !resultado.filtros
  ) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerReporteProductosVendidos(
  opciones,
  configuracion = {},
) {
  const resultado = await solicitar(
    crearRuta('/api/reportes/productos-vendidos', {
      fecha_desde: opciones.fecha_desde,
      fecha_hasta: opciones.fecha_hasta,
      pagina: opciones.pagina,
      limite: opciones.limite,
      variante_id: opciones.variante_id,
      presentacion_id: opciones.presentacion_id,
    }),
    configuracion,
  )

  if (
    !Array.isArray(resultado?.productos) ||
    !validarPaginacion(resultado.paginacion) ||
    !resultado.filtros
  ) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerReporteInventario(opciones, configuracion = {}) {
  const resultado = await solicitar(
    crearRuta('/api/reportes/inventario', {
      pagina: opciones.pagina,
      limite: opciones.limite,
      busqueda: opciones.busqueda,
      longitud_cm: opciones.longitud_cm,
      clasificacion: opciones.clasificacion,
      estado_stock: opciones.estado_stock,
      activo: opciones.activo,
    }),
    configuracion,
  )

  if (
    !resultado?.resumen ||
    !Array.isArray(resultado.inventario) ||
    !validarPaginacion(resultado.paginacion) ||
    !resultado.filtros
  ) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerReporteMovimientosInventario(
  opciones,
  configuracion = {},
) {
  const resultado = await solicitar(
    crearRuta('/api/reportes/inventario/movimientos', {
      fecha_desde: opciones.fecha_desde,
      fecha_hasta: opciones.fecha_hasta,
      pagina: opciones.pagina,
      limite: opciones.limite,
      busqueda: opciones.busqueda,
      variante_id: opciones.variante_id,
      tipo: opciones.tipo,
      origen: opciones.origen,
      usuario_id: opciones.usuario_id,
    }),
    configuracion,
  )

  if (
    !resultado?.resumen ||
    !Array.isArray(resultado.movimientos) ||
    !validarPaginacion(resultado.paginacion) ||
    !resultado.filtros
  ) {
    throw errorFormato()
  }

  return resultado
}

export async function obtenerReporteCotizaciones(
  opciones,
  configuracion = {},
) {
  const resultado = await solicitar(
    crearRuta('/api/reportes/cotizaciones', {
      fecha_desde: opciones.fecha_desde,
      fecha_hasta: opciones.fecha_hasta,
      cliente_id: opciones.cliente_id,
      serie: opciones.serie,
      usuario_id: opciones.usuario_id,
    }),
    configuracion,
  )

  if (
    !resultado?.resumen ||
    !Array.isArray(resultado.estados) ||
    !resultado.filtros
  ) {
    throw errorFormato()
  }

  return resultado
}
