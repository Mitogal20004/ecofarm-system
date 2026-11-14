import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorInventario extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorInventario'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorInventario('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorInventario('La sesión no es válida.', 401)
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
    throw new ErrorInventario('No fue posible conectar con el servidor.')
  }

  if (!respuesta.ok) {
    throw new ErrorInventario(
      'No fue posible completar la operación.',
      [400, 401, 403, 404, 409].includes(respuesta.status)
        ? respuesta.status
        : null,
    )
  }

  try {
    return await respuesta.json()
  } catch {
    throw new ErrorInventario('El servidor devolvió una respuesta inválida.')
  }
}

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

const validarPaginacion = (paginacion) =>
  paginacion &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

export async function listarInventario(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'longitud_cm', opciones.longitud_cm)
  agregarParametro(parametros, 'clasificacion', opciones.clasificacion)
  agregarParametro(parametros, 'estado_stock', opciones.estado_stock)
  agregarParametro(parametros, 'activo', opciones.activo)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/inventario${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !Array.isArray(resultado?.inventario) ||
    !Array.isArray(resultado.presentaciones) ||
    !resultado.resumen ||
    !validarPaginacion(resultado.paginacion)
  ) {
    throw new ErrorInventario('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function listarMovimientos(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'variante_id', opciones.variante_id)
  agregarParametro(parametros, 'tipo', opciones.tipo)
  agregarParametro(parametros, 'fecha_desde', opciones.fecha_desde)
  agregarParametro(parametros, 'fecha_hasta', opciones.fecha_hasta)
  agregarParametro(parametros, 'usuario_id', opciones.usuario_id)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/inventario/movimientos${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !Array.isArray(resultado?.movimientos) ||
    !validarPaginacion(resultado.paginacion)
  ) {
    throw new ErrorInventario('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

const validarResultadoMovimiento = (resultado) => {
  if (
    typeof resultado?.cambio !== 'boolean' ||
    !resultado.existencia ||
    (resultado.cambio && !resultado.movimiento)
  ) {
    throw new ErrorInventario('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function registrarEntrada(datos) {
  return validarResultadoMovimiento(
    await solicitar('/api/inventario/entradas', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  )
}

export async function registrarSalida(datos) {
  return validarResultadoMovimiento(
    await solicitar('/api/inventario/salidas', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  )
}

export async function registrarAjuste(datos) {
  return validarResultadoMovimiento(
    await solicitar('/api/inventario/ajustes', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  )
}

export async function actualizarStockMinimo(varianteId, stockMinimo) {
  const resultado = await solicitar(
    `/api/inventario/${encodeURIComponent(varianteId)}/stock-minimo`,
    {
      method: 'PATCH',
      body: JSON.stringify({ stock_minimo_manojos: stockMinimo }),
    },
  )

  if (!resultado?.existencia) {
    throw new ErrorInventario('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}
