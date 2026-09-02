import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

export class ErrorConsultaAutorizacion extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorConsultaAutorizacion'
    this.codigo = causa?.code ?? null
  }
}

export async function obtenerAutorizacionUsuario(token) {
  const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
  const { data, error } = await supabaseAutenticado.rpc(
    'obtener_autorizacion_actual',
  )

  if (error) {
    throw new ErrorConsultaAutorizacion(
      'No fue posible obtener la autorización del usuario desde Supabase.',
      error,
    )
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ErrorConsultaAutorizacion(
      'Supabase devolvió una respuesta de autorización con formato inválido.',
    )
  }

  return {
    perfil: data.perfil ?? null,
    roles: Array.isArray(data.roles) ? data.roles : [],
    permisos: Array.isArray(data.permisos) ? data.permisos : [],
  }
}
