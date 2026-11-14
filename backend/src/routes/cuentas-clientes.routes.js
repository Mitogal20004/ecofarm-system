import { Router } from 'express'
import { obtenerEstadoCuenta, registrarAbono } from '../controllers/cuentas-clientes.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import { cargarAutorizacion, requerirPermiso } from '../middlewares/autorizacion.js'

const router = Router()
const proteger = (permiso) => [autenticarUsuario, cargarAutorizacion, requerirPermiso(permiso)]
router.get('/:clienteId', ...proteger('cliente.estado_cuenta'), obtenerEstadoCuenta)
router.post('/:clienteId/abonos', ...proteger('cliente.abono'), registrarAbono)
export default router
