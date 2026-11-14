import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

export class ErrorServicioCuentasClientes extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioCuentasClientes'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

async function ejecutar(token, nombre, parametros) {
  const { data, error } = await crearClienteSupabaseAutenticado(token).rpc(nombre, parametros)
  if (error) throw new ErrorServicioCuentasClientes('No fue posible completar la operación de cuenta.', error)
  return data
}

export function obtenerEstadoCuenta(token, clienteId, mes) {
  return ejecutar(token, 'obtener_estado_cuenta_cliente', { p_cliente_id: clienteId, p_mes: mes ?? null })
}

export function registrarAbono(token, clienteId, datos) {
  return ejecutar(token, 'registrar_abono_cliente', {
    p_cliente_id: clienteId,
    p_monto: datos.monto,
    p_metodo_pago: datos.metodo_pago,
    p_observaciones: datos.observaciones ?? null,
  })
}
