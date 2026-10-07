import { Router } from 'express'
import {
  actualizarCotizacion,
  cambiarEstadoCotizacion,
  crearCotizacion,
  listarCotizaciones,
  obtenerCotizacion,
} from '../controllers/cotizaciones.controller.js'
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

router.get('/', ...proteger('cotizacion.ver'), listarCotizaciones)
router.post('/', ...proteger('cotizacion.crear'), crearCotizacion)
router.get(
  '/:cotizacionId',
  ...proteger('cotizacion.ver'),
  obtenerCotizacion,
)
router.patch(
  '/:cotizacionId',
  ...proteger('cotizacion.editar'),
  actualizarCotizacion,
)
router.patch(
  '/:cotizacionId/estado',
  ...proteger('cotizacion.editar'),
  cambiarEstadoCotizacion,
)

export default router
