import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

export class ErrorServicioRoles extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioRoles'
    this.codigo = causa?.code ?? null
  }
}

export async function listarRolesActivos(token) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const { data, error } = await supabaseAutenticado.rpc(
      'listar_roles_activos',
    )

    if (error) {
      throw new ErrorServicioRoles(
        'No fue posible consultar los roles activos en Supabase.',
        error,
      )
    }

    if (!Array.isArray(data)) {
      throw new ErrorServicioRoles(
        'Supabase devolvió una respuesta de roles con formato inválido.',
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioRoles) {
      throw error
    }

    throw new ErrorServicioRoles(
      'No fue posible consultar los roles activos en Supabase.',
      error,
    )
  }
}
