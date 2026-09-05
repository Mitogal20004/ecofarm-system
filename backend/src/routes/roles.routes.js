import { Router } from 'express'
import { listarRolesActivos } from '../controllers/roles.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()

router.get(
  '/',
  autenticarUsuario,
  cargarAutorizacion,
  requerirPermiso('rol.ver'),
  listarRolesActivos,
)

export default router
