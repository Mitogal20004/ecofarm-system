import { supabase } from '../lib/supabase'

const apiUrl = import.meta.env.VITE_API_URL

if (!apiUrl) {
  throw new Error('Falta VITE_API_URL en el entorno del frontend.')
}

// El inicio de sesión por nombre de usuario se valida en el backend.
// El frontend nunca necesita conocer el correo asociado internamente.
export async function iniciarSesion(nombreUsuario, password) {
  const respuesta = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nombre_usuario: nombreUsuario,
      password,
    }),
  })

  let resultado

  try {
    resultado = await respuesta.json()
  } catch {
    throw new Error('El servidor devolvió una respuesta inválida.')
  }

  if (!respuesta.ok) {
    const error = new Error(
      resultado?.message || 'No fue posible iniciar sesión.',
    )

    error.status = respuesta.status

    if (respuesta.status === 401) {
      error.code = 'invalid_credentials'
    }

    throw error
  }

  const accessToken = resultado?.sesion?.access_token
  const refreshToken = resultado?.sesion?.refresh_token

  if (!accessToken || !refreshToken) {
    throw new Error('El servidor devolvió una sesión inválida.')
  }

  // Registra la sesión devuelta por el backend en el cliente Supabase del
  // navegador para conservar refresh automático, logout y eventos de sesión.
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    throw error
  }

  return {
    sesion: data.session,
    usuario: data.user,
  }
}

export async function iniciarSesionConGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })

  if (error) {
    throw error
  }
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export async function obtenerSesion() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function obtenerUsuarioActual() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data.user
}

export async function solicitarRecuperacionPassword(correo) {
  const redirectTo = `${window.location.origin}/restablecer-password`
  const { error } = await supabase.auth.resetPasswordForEmail(correo, {
    redirectTo,
  })

  if (error) {
    throw error
  }
}

export async function actualizarPassword(nuevaPassword) {
  const { error } = await supabase.auth.updateUser({
    password: nuevaPassword,
  })

  if (error) {
    throw error
  }
}

export function observarCambiosAutenticacion(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((evento, sesion) => {
    callback(evento, sesion)
  })

  return () => subscription.unsubscribe()
}
