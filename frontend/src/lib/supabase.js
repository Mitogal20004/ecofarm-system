import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const esProduccion = import.meta.env.MODE === 'production'

let urlSupabaseValida = false
try {
  const url = new URL(supabaseUrl)
  urlSupabaseValida =
    (url.protocol === 'https:' || (!esProduccion && url.hostname === 'localhost')) &&
    !url.username &&
    !url.password
} catch {
  urlSupabaseValida = false
}

if (!urlSupabaseValida || !supabasePublishableKey) {
  throw new Error(
    'La configuración de Supabase es inválida o está incompleta.',
  )
}

// La sesión se conserva mientras la pestaña permanezca abierta.
// Al cerrar la pestaña o el navegador, el usuario deberá autenticarse nuevamente.
const almacenamientoSesion =
  typeof window !== 'undefined' ? window.sessionStorage : undefined

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: almacenamientoSesion,
    },
  },
)
