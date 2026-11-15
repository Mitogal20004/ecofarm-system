import { obtenerSesion } from './auth'
import { apiUrl } from './apiConfig'

async function solicitar(ruta, opciones = {}) {
  const sesion = await obtenerSesion()
  if (!sesion?.access_token) throw new Error('La sesión no es válida.')

  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...opciones,
    headers: {
      ...opciones.headers,
      Authorization: `Bearer ${sesion.access_token}`,
    },
  })
  const cuerpo = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const error = new Error(cuerpo?.message || 'No fue posible consultar la operación.')
    error.status = respuesta.status
    throw error
  }
  return cuerpo
}

export async function listarLotesOperativos() {
  const resultado = await solicitar('/api/operaciones/lotes')
  if (!Array.isArray(resultado?.lotes)) throw new Error('Respuesta de lotes inválida.')
  return resultado.lotes
}

export async function crearLote(datos) {
  const resultado = await solicitar('/api/operaciones/lotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!resultado?.lote) throw new Error('Respuesta de lote inválida.')
  return resultado.lote
}

export async function registrarCalidadLote(datos) {
  const resultado = await solicitar('/api/operaciones/lotes/calidad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!resultado?.inspeccion) throw new Error('Respuesta de calidad inválida.')
  return resultado.inspeccion
}

export async function generarQrLote(loteId) {
  const resultado = await solicitar(`/api/operaciones/lotes/${loteId}/qr`, {
    method: 'POST',
  })
  if (!resultado?.qr?.url) throw new Error('Respuesta de QR inválida.')
  return resultado.qr
}

export async function listarProveedoresOperativos() {
  const resultado = await solicitar('/api/operaciones/proveedores')
  if (!Array.isArray(resultado?.proveedores)) {
    throw new Error('Respuesta de proveedores inválida.')
  }
  return resultado.proveedores
}

export async function crearProveedor(datos) {
  const resultado = await solicitar('/api/operaciones/proveedores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!resultado?.proveedor) throw new Error('Respuesta de proveedor inválida.')
  return resultado.proveedor
}

export async function eliminarProveedor(proveedorId) {
  await solicitar(`/api/operaciones/proveedores/${proveedorId}`, { method: 'DELETE' })
}
export const actualizarProveedor = (id, activo) => actualizarOperacion(`/api/operaciones/proveedores/${id}/estado`, 'proveedor', { activo })
export const editarProveedor = (id, datos) => actualizarOperacion(`/api/operaciones/proveedores/${id}`, 'proveedor', datos)
export const actualizarInsumo = (id, activo) => crearOperacion(`/api/operaciones/insumos/${id}/estado`, 'insumo', { activo })
export const editarInsumo = (id, datos) => actualizarOperacion(`/api/operaciones/insumos/${id}`, 'insumo', datos)
export const eliminarInsumo = async (id) => solicitar(`/api/operaciones/insumos/${id}`, { method: 'DELETE' })

const actualizarOperacion = async (ruta, clave, datos) => {
  const resultado = await solicitar(ruta, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!resultado?.[clave]) throw new Error(`Respuesta de ${clave} inválida.`)
  return resultado[clave]
}

const crearOperacion = async (ruta, clave, datos) => {
  const resultado = await solicitar(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!resultado?.[clave]) throw new Error(`Respuesta de ${clave} inválida.`)
  return resultado[clave]
}

const listarOperacion = async (ruta, clave) => {
  const resultado = await solicitar(ruta)
  if (!Array.isArray(resultado?.[clave])) throw new Error(`Respuesta de ${clave} inválida.`)
  return resultado[clave]
}

export const listarInsumosOperativos = () => listarOperacion('/api/operaciones/insumos', 'insumos')
export const crearInsumo = (datos) => crearOperacion('/api/operaciones/insumos', 'insumo', datos)
export const listarComprasOperativas = () => listarOperacion('/api/operaciones/compras', 'compras')
export const crearCompra = (datos) => crearOperacion('/api/operaciones/compras', 'compra', datos)
export const crearCompraDetalle = (compraId, datos) => crearOperacion(`/api/operaciones/compras/${compraId}/detalles`, 'detalle', datos)
export const recibirCompra = async (compraId) => solicitar(`/api/operaciones/compras/${compraId}/recibir`, { method: 'POST' })
export const listarPedidosOperativos = () => listarOperacion('/api/operaciones/pedidos', 'pedidos')
export const crearPedido = (datos) => crearOperacion('/api/operaciones/pedidos', 'pedido', datos)
export const crearPedidoDetalle = (pedidoId, datos) => crearOperacion(`/api/operaciones/pedidos/${pedidoId}/detalles`, 'detalle', datos)
export const reservarPedidoFifo = async (pedidoId) => solicitar(`/api/operaciones/pedidos/${pedidoId}/reservar`, { method: 'POST' })
export const liberarReserva = async (id) => solicitar(`/api/operaciones/reservas/${id}/liberar`, { method: 'POST' })
export const consumirReserva = async (id) => solicitar(`/api/operaciones/reservas/${id}/consumir`, { method: 'POST' })
export const listarReservasOperativas = () => listarOperacion('/api/operaciones/reservas', 'reservas')
export const listarDespachosOperativos = () => listarOperacion('/api/operaciones/despachos', 'despachos')
export const crearDespacho = (datos) => crearOperacion('/api/operaciones/despachos', 'despacho', datos)
export const actualizarDespacho = (id, estado) => crearOperacion(`/api/operaciones/despachos/${id}/estado`, 'despacho', { estado })
export const listarOrdenesEmpaque = () => listarOperacion('/api/operaciones/empaque', 'ordenes')
export const crearOrdenEmpaque = (datos) => crearOperacion('/api/operaciones/empaque', 'orden', datos)
export const actualizarOrdenEmpaque = (id, estado) => crearOperacion(`/api/operaciones/empaque/${id}/estado`, 'orden', { estado })
export const crearMerma = (datos) => crearOperacion('/api/operaciones/mermas', 'merma', datos)
export const listarMermasOperativas = () => listarOperacion('/api/operaciones/mermas', 'mermas')
