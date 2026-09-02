import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

const crearOpcionesAutenticacion = () => ({
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
})

// El backend utiliza la publishable key solamente para solicitar a Supabase
// Auth la validación de identidades. No requiere privilegios administrativos.
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en el entorno del backend.',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: crearOpcionesAutenticacion(),
})

// Cada petición utiliza una instancia aislada con el JWT que ya validó el
// middleware. Así auth.uid() recibe la identidad correcta al ejecutar RPC.
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
