import { Router } from 'express'
import {
  actualizarPerfilUsuario,
  crearUsuario,
  listarUsuarios,
  obtenerDetalleUsuario,
  reemplazarRolesUsuario,
} from '../controllers/usuarios.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const requerirConsultaUsuarios = requerirPermiso('usuario.ver')
const requerirAdministracionUsuarios = requerirPermiso('usuario.administrar')

router.post(
  '/',
  autenticarUsuario,
  cargarAutorizacion,
  requerirAdministracionUsuarios,
  crearUsuario,
)

router.get(
  '/',
  autenticarUsuario,
  cargarAutorizacion,
  requerirConsultaUsuarios,
  listarUsuarios,
)

router.get(
  '/:usuarioId',
  autenticarUsuario,
  cargarAutorizacion,
  requerirConsultaUsuarios,
  obtenerDetalleUsuario,
)

router.patch(
  '/:usuarioId',
  autenticarUsuario,
  cargarAutorizacion,
  requerirAdministracionUsuarios,
  actualizarPerfilUsuario,
)

router.put(
  '/:usuarioId/roles',
  autenticarUsuario,
  cargarAutorizacion,
  requerirAdministracionUsuarios,
  reemplazarRolesUsuario,
)

export default router
