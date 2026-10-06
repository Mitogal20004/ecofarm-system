import { Router } from 'express'
import {
  actualizarStockMinimo,
  listarInventario,
  listarMovimientos,
  registrarAjuste,
  registrarEntrada,
  registrarSalida,
} from '../controllers/inventario.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const requerirConsultaInventario = requerirPermiso('inventario.ver')
const requerirConsultaMovimientos = requerirPermiso(
  'inventario.ver_movimientos',
)
const requerirRegistroMovimiento = requerirPermiso(
  'inventario.registrar_movimiento',
)
const requerirAjusteInventario = requerirPermiso('inventario.ajustar')

const proteger = (permiso) => [autenticarUsuario, cargarAutorizacion, permiso]

router.get('/', ...proteger(requerirConsultaInventario), listarInventario)
router.get(
  '/movimientos',
  ...proteger(requerirConsultaMovimientos),
  listarMovimientos,
)
router.post(
  '/entradas',
  ...proteger(requerirRegistroMovimiento),
  registrarEntrada,
)
router.post(
  '/salidas',
  ...proteger(requerirRegistroMovimiento),
  registrarSalida,
)
router.post(
  '/ajustes',
  ...proteger(requerirAjusteInventario),
  registrarAjuste,
)
router.patch(
  '/:varianteId/stock-minimo',
  ...proteger(requerirAjusteInventario),
  actualizarStockMinimo,
)

export default router
