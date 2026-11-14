import { obtenerSesion } from './auth'

import { apiUrl } from './apiConfig'

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

export class ErrorConsultaRoles extends Error {
  constructor(status = null) {
    super('No fue posible consultar los roles.')
    this.name = 'ErrorConsultaRoles'
    this.status = status
  }
}

export async function listarRolesActivos() {
  let sesion

  try {
    sesion = await obtenerSesion()
  } catch {
    throw new ErrorConsultaRoles()
  }

  const accessToken = sesion?.access_token

  if (!accessToken) {
    throw new ErrorConsultaRoles(401)
  }

  let respuesta

  try {
    respuesta = await fetch(`${apiUrl}/api/roles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new ErrorConsultaRoles()
  }

  if (!respuesta.ok) {
    throw new ErrorConsultaRoles(
      respuesta.status === 401 || respuesta.status === 403
        ? respuesta.status
        : null,
    )
  }

  let resultado

  try {
    resultado = await respuesta.json()
  } catch {
    throw new ErrorConsultaRoles()
  }

  if (!Array.isArray(resultado)) {
    throw new ErrorConsultaRoles()
  }

  return resultado
}
