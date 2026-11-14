import { Router } from 'express'
import { iniciarSesion } from '../controllers/auth.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import { cargarAutorizacion } from '../middlewares/autorizacion.js'
import { limitarIntentosLogin } from '../middlewares/seguridad.js'

const router = Router()

router.post('/login', limitarIntentosLogin, iniciarSesion)

router.get(
  '/me',
  autenticarUsuario,
  cargarAutorizacion,
  (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      ok: true,
      usuario: {
        id: req.usuario.id,
        email: req.usuario.email ?? null,
      },
      autorizacion: {
        perfil: req.autorizacion.perfil,
        roles: req.autorizacion.roles,
        permisos: req.autorizacion.permisos,
      },
    })
  },
)

export default router
