import { Router } from 'express'
import {
  actualizarVariante,
  crearVariante,
  listarHistorialPrecios,
  listarPresentaciones,
  listarVariantes,
  obtenerDetalleVariante,
  obtenerPreciosVigentes,
  registrarPrecio,
} from '../controllers/productos.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const requerirConsultaProductos = requerirPermiso('producto.ver')
const requerirCreacionProductos = requerirPermiso('producto.crear')
const requerirEdicionProductos = requerirPermiso('producto.editar')

const proteger = (permiso) => [autenticarUsuario, cargarAutorizacion, permiso]

router.get('/', ...proteger(requerirConsultaProductos), listarVariantes)
router.get(
  '/presentaciones',
  ...proteger(requerirConsultaProductos),
  listarPresentaciones,
)
router.post(
  '/variantes',
  ...proteger(requerirCreacionProductos),
  crearVariante,
)
router.get(
  '/variantes/:varianteId',
  ...proteger(requerirConsultaProductos),
  obtenerDetalleVariante,
)
router.patch(
  '/variantes/:varianteId',
  ...proteger(requerirEdicionProductos),
  actualizarVariante,
)
router.get(
  '/variantes/:varianteId/precios',
  ...proteger(requerirConsultaProductos),
  obtenerPreciosVigentes,
)
router.post(
  '/variantes/:varianteId/precios',
  ...proteger(requerirEdicionProductos),
  registrarPrecio,
)
router.get(
  '/variantes/:varianteId/precios/historial',
  ...proteger(requerirConsultaProductos),
  listarHistorialPrecios,
)

export default router
