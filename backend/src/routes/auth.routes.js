import { Router } from 'express'
import { iniciarSesion } from '../controllers/auth.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()

router.post('/login', iniciarSesion)

router.get(
  '/me',
  autenticarUsuario,
  cargarAutorizacion,
  requerirPermiso('usuario.ver'),
  (req, res) => {
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
