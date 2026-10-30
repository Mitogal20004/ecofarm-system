import { Router } from 'express'
import {
  abrirCaja,
  cerrarCaja,
  listarCajas,
  obtenerCaja,
  obtenerCajaActual,
  obtenerEstadoDevolucionVenta,
  obtenerResumenCajaActual,
  registrarDevolucionVenta,
} from '../controllers/caja.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirAlgunPermiso,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()

const proteger = (verificarPermiso) => [
  autenticarUsuario,
  cargarAutorizacion,
  verificarPermiso,
]

const operarCaja = requerirPermiso('caja.operar')
const operarOConsultar = requerirAlgunPermiso('caja.operar', 'caja.ver')
const operarOSupervisar = requerirAlgunPermiso(
  'caja.operar',
  'caja.supervisar',
)
const consultarDevolucion = requerirAlgunPermiso(
  'venta.ver',
  'caja.registrar_devolucion',
)
const registrarDevolucion = requerirPermiso(
  'caja.registrar_devolucion',
)

router.post('/abrir', ...proteger(operarCaja), abrirCaja)
router.get(
  '/actual/resumen',
  ...proteger(operarOConsultar),
  obtenerResumenCajaActual,
)
router.get('/actual', ...proteger(operarOConsultar), obtenerCajaActual)
router.post(
  '/:cajaId/cerrar',
  ...proteger(operarOSupervisar),
  cerrarCaja,
)
router.get(
  '/ventas/:ventaId/devolucion',
  ...proteger(consultarDevolucion),
  obtenerEstadoDevolucionVenta,
)
router.post(
  '/ventas/:ventaId/devolucion',
  autenticarUsuario,
  cargarAutorizacion,
  registrarDevolucion,
  operarCaja,
  registrarDevolucionVenta,
)
router.get('/', ...proteger(operarOConsultar), listarCajas)
router.get('/:cajaId', ...proteger(operarOConsultar), obtenerCaja)

export default router
