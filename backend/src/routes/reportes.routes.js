import { Router } from 'express'
import {
  listarProductosVendidos,
  obtenerReporteCotizaciones,
  obtenerReporteInventario,
  obtenerReporteMovimientosInventario,
  obtenerReporteVentas,
} from '../controllers/reportes.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const protegerReporte = [
  autenticarUsuario,
  cargarAutorizacion,
  requerirPermiso('reporte.ver'),
]

router.get('/ventas', ...protegerReporte, obtenerReporteVentas)
router.get(
  '/productos-vendidos',
  ...protegerReporte,
  listarProductosVendidos,
)
router.get('/inventario', ...protegerReporte, obtenerReporteInventario)
router.get(
  '/inventario/movimientos',
  ...protegerReporte,
  obtenerReporteMovimientosInventario,
)
router.get('/cotizaciones', ...protegerReporte, obtenerReporteCotizaciones)

export default router
