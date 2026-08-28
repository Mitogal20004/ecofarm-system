import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Detiene la aplicación con un mensaje comprensible si la configuración local
// está incompleta, sin imprimir ni exponer el contenido de las credenciales.
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.',
  )
}

// Esta instancia centraliza el acceso futuro a Supabase para evitar crear un
// cliente diferente en cada módulo del frontend.
export const supabase = createClient(supabaseUrl, supabasePublishableKey)
