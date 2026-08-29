import { supabase } from '../lib/supabase.js'

const responderTokenInvalido = (res) =>
  res.status(401).json({
    ok: false,
    message: 'Token inválido o expirado',
  })

// Supabase Auth valida la identidad contenida en el Bearer token. Solo después
// de esa comprobación el usuario se expone a las rutas mediante req.usuario.
export async function autenticarUsuario(req, res, next) {
  const autorizacion = req.get('authorization')

  if (!autorizacion) {
    return res.status(401).json({
      ok: false,
      message: 'Autenticación requerida',
    })
  }

  const partes = autorizacion.trim().split(/\s+/)
  const esquemaValido = partes.length === 2 && partes[0].toLowerCase() === 'bearer'
  const token = esquemaValido ? partes[1] : ''

  if (!token) {
    return responderTokenInvalido(res)
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return responderTokenInvalido(res)
    }

    // Este usuario proviene del JWT verificado; no se acepta un identificador
    // enviado por body, query u otro encabezado controlado por el cliente.
    req.usuario = user
    return next()
  } catch {
    return responderTokenInvalido(res)
  }
}
