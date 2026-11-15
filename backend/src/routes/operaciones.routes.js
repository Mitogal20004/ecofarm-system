import { Router } from 'express'
import * as controller from '../controllers/operaciones.controller.js'
import { autenticarUsuario } from '../middlewares/autenticacion.js'
import {
  cargarAutorizacion,
  requerirAlgunPermiso,
  requerirPermiso,
} from '../middlewares/autorizacion.js'

const router = Router()
const proteger = (permiso) => [autenticarUsuario, cargarAutorizacion, requerirPermiso(permiso)]

router.get(
  '/lotes',
  autenticarUsuario,
  cargarAutorizacion,
  requerirAlgunPermiso('lote.ver', 'caja.operar'),
  controller.listarLotes,
)
router.post('/lotes', ...proteger('lote.administrar'), controller.crearLote)
router.post('/lotes/calidad', ...proteger('calidad.registrar'), controller.registrarCalidad)
router.post('/lotes/:loteId/qr', ...proteger('lote.administrar'), controller.generarQrLote)
router.get('/insumos', ...proteger('insumo.ver'), controller.listarInsumos)
router.post('/insumos', ...proteger('insumo.administrar'), controller.crearInsumo)
router.patch('/insumos/:insumoId/estado', ...proteger('insumo.administrar'), controller.actualizarInsumo)
router.patch('/insumos/:insumoId', ...proteger('insumo.administrar'), controller.actualizarInsumoDatos)
router.delete('/insumos/:insumoId', ...proteger('insumo.administrar'), controller.eliminarInsumo)
router.get('/proveedores', ...proteger('compra.ver'), controller.listarProveedores)
router.post('/proveedores', ...proteger('compra.administrar'), controller.crearProveedor)
router.delete('/proveedores/:proveedorId', ...proteger('compra.administrar'), controller.eliminarProveedor)
router.patch('/proveedores/:proveedorId', ...proteger('compra.administrar'), controller.actualizarProveedor)
router.patch('/proveedores/:proveedorId/estado', ...proteger('compra.administrar'), controller.actualizarProveedorEstado)
router.get('/compras', ...proteger('compra.ver'), controller.listarCompras)
router.post('/compras', ...proteger('compra.administrar'), controller.crearCompra)
router.post('/compras/:compraId/detalles', ...proteger('compra.administrar'), controller.crearCompraDetalle)
router.post('/compras/:compraId/recibir', ...proteger('compra.administrar'), controller.recibirCompra)
router.get('/pedidos', ...proteger('pedido.ver'), controller.listarPedidos)
router.post('/pedidos', ...proteger('pedido.administrar'), controller.crearPedido)
router.post('/pedidos/:pedidoId/detalles', ...proteger('pedido.administrar'), controller.crearPedidoDetalle)
router.post('/pedidos/:pedidoId/reservar', ...proteger('pedido.administrar'), controller.reservarPedidoFifo)
router.post('/reservas/:reservaId/liberar', ...proteger('pedido.administrar'), controller.liberarReserva)
router.post('/reservas/:reservaId/consumir', ...proteger('pedido.administrar'), controller.consumirReserva)
router.get('/reservas', ...proteger('pedido.ver'), controller.listarReservas)
router.get('/despachos', ...proteger('despacho.ver'), controller.listarDespachos)
router.post('/despachos', ...proteger('despacho.administrar'), controller.crearDespacho)
router.patch('/despachos/:despachoId/estado', ...proteger('despacho.administrar'), controller.actualizarDespacho)
router.get('/empaque', ...proteger('pedido.ver'), controller.listarOrdenesEmpaque)
router.post('/empaque', ...proteger('pedido.administrar'), controller.crearOrdenEmpaque)
router.patch('/empaque/:ordenId/estado', ...proteger('pedido.administrar'), controller.actualizarOrdenEmpaque)
router.post('/mermas', ...proteger('merma.registrar'), controller.registrarMerma)
router.get('/mermas', ...proteger('merma.ver'), controller.listarMermas)

export default router
