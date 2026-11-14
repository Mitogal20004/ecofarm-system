import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'
import { verificarPaymentIntent } from './stripe.service.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioVentas extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioVentas'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioVentas(
    'Supabase devolvió una respuesta de ventas con formato inválido.',
  )

async function ejecutarRpcVentas(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioVentas(
        'No fue posible completar la operación de ventas en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioVentas) throw error

    throw new ErrorServicioVentas(
      'No fue posible completar la operación de ventas en Supabase.',
      error,
    )
  }
}

const validarResumenVenta = (data, requiereCambio = false) => {
  if (
    !esObjeto(data) ||
    !esObjeto(data.venta) ||
    (requiereCambio && typeof data.cambio !== 'boolean') ||
    (data.recibo !== undefined && data.recibo !== null && !esObjeto(data.recibo))
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarVentas(token, opciones = {}) {
  const parametros = {}

  if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
  if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
  if (opciones.busqueda !== undefined) parametros.p_busqueda = opciones.busqueda
  if (opciones.estado !== undefined) parametros.p_estado = opciones.estado
  if (opciones.tipoDocumento !== undefined) {
    parametros.p_tipo_documento = opciones.tipoDocumento
  }
  if (opciones.fechaDesde !== undefined) {
    parametros.p_fecha_desde = opciones.fechaDesde
  }
  if (opciones.fechaHasta !== undefined) {
    parametros.p_fecha_hasta = opciones.fechaHasta
  }
  if (opciones.usuarioId !== undefined) {
    parametros.p_usuario_id = opciones.usuarioId
  }

  const data = await ejecutarRpcVentas(token, 'listar_ventas', parametros)

  if (
    !esObjeto(data) ||
    !Array.isArray(data.ventas) ||
    !esObjeto(data.paginacion) ||
    !Number.isInteger(data.paginacion.pagina) ||
    !Number.isInteger(data.paginacion.limite) ||
    !Number.isInteger(data.paginacion.total) ||
    !Number.isInteger(data.paginacion.total_paginas)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function obtenerVenta(token, ventaId) {
  const data = await ejecutarRpcVentas(token, 'obtener_venta', {
    p_venta_id: ventaId,
  })
  let consumosLotes = []

  try {
    consumosLotes = await ejecutarRpcVentas(token, 'listar_consumos_lote_venta', {
      p_venta_id: ventaId,
    })
  } catch (error) {
    // La consulta adicional permite desplegar el frontend antes de aplicar la
    // migración FIFO en todos los ambientes; el detalle histórico sigue siendo
    // válido si aún no existe la RPC nueva.
    if (!/does not exist|not found|undefined/i.test(error?.cause?.message ?? '')) {
      throw error
    }
  }

  if (
    !esObjeto(data) ||
    !esObjeto(data.venta) ||
    !Array.isArray(data.detalles) ||
    !Array.isArray(data.movimientos_inventario) ||
    (data.recibo !== null && !esObjeto(data.recibo))
  ) {
    throw crearErrorFormato()
  }

  return { ...data, consumos_lotes: Array.isArray(consumosLotes) ? consumosLotes : [] }
}

export async function confirmarVenta(token, claveIdempotencia, datos) {
  if (datos.metodo_pago === 'tarjeta') {
    try {
      await verificarPaymentIntent({
        paymentIntentId: datos.stripe_payment_intent_id,
        montoGtq: datos.monto_recibido,
      })
    } catch (error) {
      if (error?.codigo === '23514') {
        throw new ErrorServicioVentas(error.message, {
          code: '23514',
          message: error.message,
        })
      }
      throw error
    }
  }

  const data = await ejecutarRpcVentas(token, 'confirmar_venta', {
    p_clave_idempotencia: claveIdempotencia,
    p_cliente_id: datos.cliente_id,
    p_comprador_nombre: datos.comprador_nombre,
    p_comprador_nit: datos.comprador_nit,
    p_comprador_direccion: datos.comprador_direccion,
    p_observaciones: datos.observaciones,
    p_detalles: datos.detalles,
    p_monto_recibido: datos.monto_recibido,
    p_metodo_pago: datos.metodo_pago ?? 'efectivo',
    p_stripe_payment_intent_id: datos.stripe_payment_intent_id ?? null,
    p_generar_recibo: true,
  })

  return validarResumenVenta(data, true)
}

export async function confirmarVentaCredito(token, claveIdempotencia, datos) {
  const data = await ejecutarRpcVentas(token, 'confirmar_venta_credito', {
    p_clave_idempotencia: claveIdempotencia,
    p_cliente_id: datos.cliente_id,
    p_observaciones: datos.observaciones,
    p_detalles: datos.detalles,
    p_monto_recibido: datos.monto_recibido,
    p_generar_recibo: true,
  })

  return validarResumenVenta(data, true)
}

export async function convertirCotizacionVenta(
  token,
  cotizacionId,
  montoRecibido,
) {
  const data = await ejecutarRpcVentas(token, 'convertir_cotizacion_venta', {
    p_cotizacion_id: cotizacionId,
    p_monto_recibido: montoRecibido,
    p_generar_recibo: true,
  })

  return validarResumenVenta(data)
}

export async function convertirCotizacionVentaCredito(token, cotizacionId, montoRecibido) {
  const data = await ejecutarRpcVentas(token, 'convertir_cotizacion_venta_credito', {
    p_cotizacion_id: cotizacionId,
    p_monto_recibido: montoRecibido,
    p_generar_recibo: true,
  })

  return validarResumenVenta(data, true)
}

export async function generarReciboVenta(token, ventaId) {
  const data = await ejecutarRpcVentas(token, 'generar_recibo_venta', {
    p_venta_id: ventaId,
  })

  if (
    !esObjeto(data) ||
    typeof data.cambio !== 'boolean' ||
    !esObjeto(data.recibo)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function anularVenta(token, ventaId, motivo) {
  const data = await ejecutarRpcVentas(token, 'anular_venta', {
    p_venta_id: ventaId,
    p_motivo: motivo,
  })

  return validarResumenVenta(data, true)
}
