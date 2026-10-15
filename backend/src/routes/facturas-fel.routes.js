import { Router } from 'express'
import {
  listarFacturasFel,
  obtenerFacturaFel,
  solicitarFacturaFel,
} from '../controllers/facturas-fel.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const proteger = (codigoPermiso) => [
  autenticarUsuario,
  cargarAutorizacion,
  requerirPermiso(codigoPermiso),
]

router.get('/', ...proteger('factura.ver'), listarFacturasFel)
router.post('/', ...proteger('factura.generar'), solicitarFacturaFel)
router.get('/:facturaId', ...proteger('factura.ver'), obtenerFacturaFel)

export default router
