import { supabaseAdmin } from '../lib/supabase.js'
import { createHash, randomBytes } from 'node:crypto'

export class ErrorServicioOperaciones extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioOperaciones'
    this.codigo = causa?.code ?? null
  }
}

async function ejecutar(consulta) {
  const { data, error } = await consulta
  if (error) throw new ErrorServicioOperaciones('No fue posible completar la operación.', error)
  return data
}

export const listar = (tabla, columnas = '*') =>
  ejecutar(supabaseAdmin.from(tabla).select(columnas).order('fecha_creacion', { ascending: false }))

export const obtener = (tabla, id, columnas = '*') =>
  ejecutar(supabaseAdmin.from(tabla).select(columnas).eq('id', id).maybeSingle())

export const crear = (tabla, datos) =>
  ejecutar(supabaseAdmin.from(tabla).insert(datos).select().single())

export const actualizar = (tabla, id, datos) =>
  ejecutar(supabaseAdmin.from(tabla).update(datos).eq('id', id).select().single())

export const listarLotes = () => ejecutar(
  supabaseAdmin
    .from('lotes')
    .select('id, variante_id, codigo, fecha_origen, calidad, estado, cantidad_disponible')
    .order('fecha_origen', { ascending: true })
    .order('id', { ascending: true }),
)
export const crearLote = (datos) => crear('lotes', datos)
export const listarInsumos = () => listar('insumos')
export const crearInsumo = (datos) => crear('insumos', datos)
export const listarProveedores = () => listar('proveedores')
export const crearProveedor = (datos) => crear('proveedores', datos)
export const eliminarProveedor = (id) => ejecutar(
  supabaseAdmin.from('proveedores').delete().eq('id', id),
)
export const actualizarProveedor = (id, datos) => actualizar('proveedores', id, datos)
export const actualizarInsumo = (id, datos) => actualizar('insumos', id, datos)
export const listarCompras = () => listar('compras')
export const crearCompra = (datos) => crear('compras', datos)
export const crearCompraDetalle = (datos) => crear('compra_detalles', datos)
export const listarPedidos = () => listar('pedidos')
export const crearPedido = (datos) => crear('pedidos', datos)
export const crearPedidoDetalle = (datos) => crear('pedido_detalles', datos)
export const listarDespachos = () => listar('despachos')
export const crearDespacho = (datos) => crear('despachos', datos)
export const actualizarDespacho = (id, datos) => actualizar('despachos', id, datos)
export const listarOrdenesEmpaque = () => listar('ordenes_empaque')
export const crearOrdenEmpaque = (datos) => crear('ordenes_empaque', datos)
export const actualizarOrdenEmpaque = (id, datos) => actualizar('ordenes_empaque', id, datos)

export async function registrarCalidad(datos) {
  const inspeccion = await crear('inspecciones_calidad', datos)
  const estado = datos.resultado === 'aprobado' ? 'liberado' : datos.resultado === 'rechazado' ? 'rechazado' : 'cuarentena'
  await actualizar('lotes', datos.lote_id, { estado, fecha_actualizacion: new Date().toISOString() })
  return inspeccion
}

export const registrarMerma = (datos) => crear('mermas', datos)
export const registrarMermaOperativa = (datos) => ejecutar(supabaseAdmin.rpc('registrar_merma_operativa', {
  p_lote_id: datos.lote_id,
  p_insumo_id: datos.insumo_id,
  p_etapa: datos.etapa,
  p_motivo: datos.motivo,
  p_cantidad: datos.cantidad,
  p_costo_unitario: datos.costo_unitario,
  p_observaciones: datos.observaciones,
  p_usuario_id: datos.registrado_por,
}))
export const listarMermas = () => ejecutar(
  supabaseAdmin
    .from('mermas')
    .select('*')
    .order('fecha_merma', { ascending: false })
    .order('id', { ascending: false }),
)

const hashQr = (token) => createHash('sha256').update(token).digest('hex')

export async function generarQrLote(loteId) {
  const lote = await obtener('lotes', loteId, 'id, codigo')
  if (!lote) throw new ErrorServicioOperaciones('El lote indicado no existe.')

  const existente = await supabaseAdmin
    .from('qr_lotes')
    .select('id')
    .eq('lote_id', loteId)
    .maybeSingle()

  if (existente.error) throw new ErrorServicioOperaciones('No fue posible consultar el QR del lote.', existente.error)
  if (existente.data) throw new ErrorServicioOperaciones('El lote ya tiene un QR activo.')

  const token = randomBytes(32).toString('base64url')
  await ejecutar(supabaseAdmin.from('qr_lotes').insert({ lote_id: loteId, token_hash: hashQr(token) }))

  return {
    lote_id: loteId,
    codigo: lote.codigo,
    url: `${process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/trazabilidad/lotes/${token}`,
  }
}

export async function consultarTrazabilidadQr(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null

  const qr = await ejecutar(
    supabaseAdmin
      .from('qr_lotes')
      .select('lote_id')
      .eq('token_hash', hashQr(token))
      .eq('activo', true)
      .maybeSingle(),
  )
  if (!qr) return null

  const lote = await obtener(
    'lotes',
    qr.lote_id,
    'codigo, origen, fecha_origen, fecha_recepcion, variedad, color, longitud_cm, calidad, cantidad_inicial, estado',
  )
  if (!lote) return null

  const inspecciones = await ejecutar(
    supabaseAdmin
      .from('inspecciones_calidad')
      .select('resultado, observaciones, fecha_inspeccion')
      .eq('lote_id', qr.lote_id)
      .order('fecha_inspeccion', { ascending: false }),
  )

  return { lote, inspecciones }
}

export const recibirCompra = (compraId, usuarioId) => ejecutar(
  supabaseAdmin.rpc('recibir_compra', {
    p_compra_id: compraId,
    p_usuario_id: usuarioId,
  }),
)

export const reservarPedidoFifo = (pedidoId, usuarioId) => ejecutar(
  supabaseAdmin.rpc('reservar_pedido_fifo', {
    p_pedido_id: pedidoId,
    p_usuario_id: usuarioId,
  }),
)
export const liberarReserva = (reservaId) => ejecutar(supabaseAdmin.rpc('liberar_reserva_pedido', { p_reserva_id: reservaId }))
export const consumirReserva = (reservaId) => ejecutar(supabaseAdmin.rpc('consumir_reserva_pedido', { p_reserva_id: reservaId }))
export const listarReservas = () => ejecutar(supabaseAdmin.from('reservas_pedido').select('id, pedido_detalle_id, lote_id, cantidad, estado, fecha_reserva, fecha_liberacion').order('fecha_reserva', { ascending: false }))
