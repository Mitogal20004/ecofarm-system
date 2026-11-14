import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorClientes extends Error {
  constructor(mensaje, status = null) {
    super(mensaje)
    this.name = 'ErrorClientes'
    this.status = status
  }
}

const obtenerToken = async () => {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorClientes('No fue posible comprobar la sesión.')
  }

  if (!sesion?.access_token) {
    throw new ErrorClientes('La sesión no es válida.', 401)
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
    throw new ErrorClientes('No fue posible conectar con el servidor.')
  }

  if (!respuesta.ok) {
    throw new ErrorClientes(
      'No fue posible completar la operación.',
      [400, 401, 403, 404, 409].includes(respuesta.status)
        ? respuesta.status
        : null,
    )
  }

  try {
    return await respuesta.json()
  } catch {
    throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  }
}

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

export async function listarClientes(opciones = {}) {
  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'activo', opciones.activo)
  agregarParametro(parametros, 'tipo', opciones.tipo)
  const consulta = parametros.toString()
  const resultado = await solicitar(
    `/api/clientes${consulta ? `?${consulta}` : ''}`,
  )

  if (
    !Array.isArray(resultado?.clientes) ||
    !resultado.paginacion ||
    !Number.isInteger(resultado.paginacion.pagina) ||
    !Number.isInteger(resultado.paginacion.limite) ||
    !Number.isInteger(resultado.paginacion.total) ||
    !Number.isInteger(resultado.paginacion.total_paginas)
  ) {
    throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function obtenerDetalleCliente(clienteId) {
  const resultado = await solicitar(
    `/api/clientes/${encodeURIComponent(clienteId)}`,
  )

  if (!resultado?.cliente || typeof resultado.cliente.id !== 'string') {
    throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function crearCliente(datos) {
  const resultado = await solicitar('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(datos),
  })

  if (!resultado?.cliente || typeof resultado.cliente.id !== 'string') {
    throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function actualizarCliente(clienteId, cambios) {
  const resultado = await solicitar(
    `/api/clientes/${encodeURIComponent(clienteId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    },
  )

  if (!resultado?.cliente || typeof resultado.cliente.id !== 'string') {
    throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  }

  return resultado
}

export async function obtenerEstadoCuenta(clienteId, mes) {
  const resultado = await solicitar(`/api/cuentas-clientes/${encodeURIComponent(clienteId)}?mes=${encodeURIComponent(mes)}`)
  if (!Array.isArray(resultado?.movimientos) || resultado.saldo === undefined) throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  return resultado
}

export async function registrarAbono(clienteId, datos) {
  const resultado = await solicitar(`/api/cuentas-clientes/${encodeURIComponent(clienteId)}/abonos`, {
    method: 'POST',
    body: JSON.stringify(datos),
  })
  if (resultado?.saldo === undefined) throw new ErrorClientes('El servidor devolvió una respuesta inválida.')
  return resultado
}
