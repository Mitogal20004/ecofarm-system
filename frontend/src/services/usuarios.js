import { obtenerSesion } from './auth'

const apiUrl = import.meta.env.VITE_API_URL

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorConsultaUsuarios extends Error {
  constructor(status = null) {
    super('No fue posible consultar los usuarios.')
    this.name = 'ErrorConsultaUsuarios'
    this.status = status
  }
}

const agregarParametro = (parametros, nombre, valor) => {
  if (valor !== undefined && valor !== null && valor !== '') {
    parametros.set(nombre, String(valor))
  }
}

export async function listarUsuarios(opciones = {}) {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorConsultaUsuarios()
  }

  const accessToken = sesion?.access_token

  if (!accessToken) {
    throw new ErrorConsultaUsuarios(401)
  }

  const parametros = new URLSearchParams()
  agregarParametro(parametros, 'pagina', opciones.pagina)
  agregarParametro(parametros, 'limite', opciones.limite)
  agregarParametro(parametros, 'busqueda', opciones.busqueda)
  agregarParametro(parametros, 'activo', opciones.activo)

  const consulta = parametros.toString()
  const url = `${apiUrl}/api/usuarios${consulta ? `?${consulta}` : ''}`
  let respuesta

  try {
    respuesta = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new ErrorConsultaUsuarios()
  }

  if (!respuesta.ok) {
    throw new ErrorConsultaUsuarios(
      respuesta.status === 401 || respuesta.status === 403
        ? respuesta.status
        : null,
    )
  }

  let resultado

  try {
    resultado = await respuesta.json()
  } catch {
    throw new ErrorConsultaUsuarios()
  }

  if (
    !resultado ||
    !Array.isArray(resultado.usuarios) ||
    !resultado.paginacion ||
    !Number.isInteger(resultado.paginacion.pagina) ||
    !Number.isInteger(resultado.paginacion.limite) ||
    !Number.isInteger(resultado.paginacion.total) ||
    !Number.isInteger(resultado.paginacion.total_paginas)
  ) {
    throw new ErrorConsultaUsuarios()
  }

  return {
    usuarios: resultado.usuarios,
    paginacion: resultado.paginacion,
  }
}
