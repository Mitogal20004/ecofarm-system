import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

const crearOpcionesAutenticacion = () => ({
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
})

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en el entorno del backend.',
  )
}

if (!supabaseSecretKey) {
  throw new Error(
    'Falta SUPABASE_SECRET_KEY en el entorno del backend.',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: crearOpcionesAutenticacion(),
})

// Crea un cliente público aislado para operaciones de autenticación.
// Evita compartir estado de sesión entre intentos de login distintos.
export function crearClienteSupabasePublico() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: crearOpcionesAutenticacion(),
  })
}

// Cliente administrativo exclusivo del backend.
// Nunca debe utilizarse desde el frontend ni exponerse su clave.
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: crearOpcionesAutenticacion(),
})

export function crearClienteSupabaseAutenticado(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new TypeError('Se requiere un access token válido de Supabase.')
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: crearOpcionesAutenticacion(),
  })
}
