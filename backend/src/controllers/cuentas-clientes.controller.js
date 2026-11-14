import {
  ErrorServicioCuentasClientes,
  obtenerEstadoCuenta as obtenerEstadoCuentaServicio,
  registrarAbono as registrarAbonoServicio,
} from '../services/cuentas-clientes.service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MES = /^\d{4}-\d{2}-01$/
const MONTO = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/
const invalida = () => { throw new Error('solicitud_invalida') }
const validarId = (id) => { if (!UUID.test(id)) invalida(); return id }
const responder = (res, error) => {
  if (error?.message === 'solicitud_invalida') return res.status(400).json({ ok: false, message: 'La solicitud contiene datos inválidos' })
  if (error instanceof ErrorServicioCuentasClientes) {
    const estados = { 42501: 403, P0002: 404, 22023: 400, 23514: 409 }
    if (estados[error.codigo]) return res.status(estados[error.codigo]).json({ ok: false, message: 'No fue posible completar la operación solicitada' })
  }
  return res.status(500).json({ ok: false, message: 'No fue posible completar la operación solicitada' })
}

export async function obtenerEstadoCuenta(req, res) {
  try {
    const mes = req.query.mes ?? null
    validarId(req.params.clienteId)
    if (mes !== null && (!MES.test(mes) || Number(mes.slice(5, 7)) > 12)) invalida()
    return res.json(await obtenerEstadoCuentaServicio(req.autenticacion.token, req.params.clienteId, mes))
  } catch (error) { return responder(res, error) }
}

export async function registrarAbono(req, res) {
  try {
    validarId(req.params.clienteId)
    const body = req.body
    if (!body || typeof body !== 'object' || Object.keys(body).some((k) => !['monto', 'metodo_pago', 'observaciones'].includes(k)) || typeof body.metodo_pago !== 'string' || !['efectivo', 'tarjeta', 'transferencia'].includes(body.metodo_pago) || typeof body.monto !== 'string' || !MONTO.test(body.monto) || Number(body.monto) <= 0) invalida()
    if (body.observaciones !== undefined && body.observaciones !== null && (typeof body.observaciones !== 'string' || body.observaciones.trim().length > 500)) invalida()
    return res.status(201).json(await registrarAbonoServicio(req.autenticacion.token, req.params.clienteId, { monto: body.monto, metodo_pago: body.metodo_pago, observaciones: body.observaciones }))
  } catch (error) { return responder(res, error) }
}
