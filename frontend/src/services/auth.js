import { supabase } from '../lib/supabase'

// Supabase Auth administra la identidad, las contraseñas y las sesiones. Este
// servicio centraliza esas operaciones sin guardar credenciales en el frontend.
// Los permisos de ECOFARM se resolverán después mediante perfiles, roles y
// permisos; no deben aceptarse roles enviados manualmente por el cliente.

export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return {
    sesion: data.session,
    usuario: data.user,
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

export function observarCambiosAutenticacion(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((evento, sesion) => {
    callback(evento, sesion)
  })

  // React podrá utilizar esta función como limpieza de un efecto para evitar
  // mantener suscripciones cuando el componente deje de estar activo.
  return () => subscription.unsubscribe()
}
