import {
  crearClienteSupabasePublico,
  supabaseAdmin,
} from '../lib/supabase.js'

export class ErrorCredencialesInvalidas extends Error {
  constructor() {
    super('Credenciales inválidas')
    this.name = 'ErrorCredencialesInvalidas'
  }
}

export class ErrorServicioAutenticacion extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioAutenticacion'
  }
}

const esErrorAutenticacionEsperado = (error) =>
  error?.code === 'invalid_credentials' ||
  error?.code === 'email_not_confirmed' ||
  error?.code === 'user_banned' ||
  error?.status === 401 ||
  error?.status === 403

export async function iniciarSesionConNombreUsuario(
  nombreUsuario,
  password,
) {
  try {
    // La Secret Key se utiliza únicamente para resolver internamente
    // qué identidad de Supabase corresponde al nombre de usuario.
    const { data: perfil, error: errorPerfil } = await supabaseAdmin
      .from('perfiles')
      .select('id, activo')
      .eq('nombre_usuario', nombreUsuario)
      .maybeSingle()

    if (errorPerfil) {
      throw new ErrorServicioAutenticacion(
        'No fue posible consultar el perfil de acceso.',
        errorPerfil,
      )
    }

    // No revelamos si el usuario existe o si está desactivado.
    if (!perfil || !perfil.activo) {
      throw new ErrorCredencialesInvalidas()
    }

    const {
      data: datosIdentidad,
      error: errorIdentidad,
    } = await supabaseAdmin.auth.admin.getUserById(perfil.id)

    if (errorIdentidad) {
      throw new ErrorServicioAutenticacion(
        'No fue posible consultar la identidad del usuario.',
        errorIdentidad,
      )
    }

    const email = datosIdentidad?.user?.email

    if (!email) {
      throw new ErrorServicioAutenticacion(
        'La identidad no posee un correo válido.',
      )
    }

    // La contraseña sigue siendo validada exclusivamente por Supabase Auth.
    // E-farm no guarda ni compara contraseñas.
    const clienteAuth = crearClienteSupabasePublico()

    const { data, error } = await clienteAuth.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (esErrorAutenticacionEsperado(error)) {
        throw new ErrorCredencialesInvalidas()
      }

      throw new ErrorServicioAutenticacion(
        'Supabase Auth no pudo completar el inicio de sesión.',
        error,
      )
    }

    if (!data?.session || !data?.user) {
      throw new ErrorServicioAutenticacion(
        'Supabase Auth devolvió una sesión con formato inválido.',
      )
    }

    return {
      sesion: data.session,
      usuario: data.user,
    }
  } catch (error) {
    if (
      error instanceof ErrorCredencialesInvalidas ||
      error instanceof ErrorServicioAutenticacion
    ) {
      throw error
    }

    throw new ErrorServicioAutenticacion(
      'No fue posible completar el inicio de sesión.',
      error,
    )
  }
}
