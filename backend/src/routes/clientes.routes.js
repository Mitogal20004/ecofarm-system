import { Router } from 'express'
import {
  actualizarCliente,
  crearCliente,
  listarClientes,
  obtenerDetalleCliente,
} from '../controllers/clientes.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const requerirConsultaClientes = requerirPermiso('cliente.ver')
const requerirCreacionClientes = requerirPermiso('cliente.crear')
const requerirEdicionClientes = requerirPermiso('cliente.editar')

router.get(
  '/',
  autenticarUsuario,
  cargarAutorizacion,
  requerirConsultaClientes,
  listarClientes,
)

router.get(
  '/:clienteId',
  autenticarUsuario,
  cargarAutorizacion,
  requerirConsultaClientes,
  obtenerDetalleCliente,
)

router.post(
  '/',
  autenticarUsuario,
  cargarAutorizacion,
  requerirCreacionClientes,
  crearCliente,
)

router.patch(
  '/:clienteId',
  autenticarUsuario,
  cargarAutorizacion,
  requerirEdicionClientes,
  actualizarCliente,
)

export default router
