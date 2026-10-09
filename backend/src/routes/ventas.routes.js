import { Router } from 'express'
import {
  anularVenta,
  confirmarVenta,
  convertirCotizacionVenta,
  crearIntencionVenta,
  generarReciboVenta,
  listarVentas,
  obtenerVenta,
} from '../controllers/ventas.controller.js'
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

router.get('/', ...proteger('venta.ver'), listarVentas)
router.post('/intenciones', ...proteger('venta.crear'), crearIntencionVenta)
router.post('/', ...proteger('venta.crear'), confirmarVenta)
router.post(
  '/desde-cotizacion/:cotizacionId',
  ...proteger('cotizacion.convertir'),
  convertirCotizacionVenta,
)
router.get('/:ventaId', ...proteger('venta.ver'), obtenerVenta)
router.post(
  '/:ventaId/recibo',
  ...proteger('venta.crear'),
  generarReciboVenta,
)
router.post('/:ventaId/anular', ...proteger('venta.anular'), anularVenta)

export default router
