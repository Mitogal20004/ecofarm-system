import {
  crearClienteSupabaseAutenticado,
  supabaseAdmin,
} from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export const RESULTADOS_PROCESAMIENTO_FEL = Object.freeze({
  CERTIFICADA: 'certificada',
  ERROR_REINTENTABLE: 'error_reintentable',
  RESULTADO_INCIERTO: 'resultado_incierto',
})

export class ErrorServicioFacturasFel extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioFacturasFel'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioFacturasFel(
    'Supabase devolvió una respuesta FEL con formato inválido.',
  )

async function ejecutarRpcAutenticada(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const { data, error } = await supabaseAutenticado.rpc(nombre, parametros)

    if (error) {
      throw new ErrorServicioFacturasFel(
        'No fue posible completar la operación FEL en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioFacturasFel) throw error

    throw new ErrorServicioFacturasFel(
      'No fue posible completar la operación FEL en Supabase.',
      error,
    )
  }
}

async function ejecutarRpcWorker(nombre, parametros) {
  try {
    const { data, error } = await supabaseAdmin.rpc(nombre, parametros)

    if (error) {
      throw new ErrorServicioFacturasFel(
        'No fue posible completar la operación interna FEL.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioFacturasFel) throw error

    throw new ErrorServicioFacturasFel(
      'No fue posible completar la operación interna FEL.',
      error,
    )
  }
}

const validarResumenSolicitud = (data) => {
  if (
    !esObjeto(data) ||
    typeof data.cambio !== 'boolean' ||
    !esObjeto(data.factura)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function solicitarFacturaFel(token, ventaId) {
  const data = await ejecutarRpcAutenticada(token, 'solicitar_factura_fel', {
    p_venta_id: ventaId,
  })

  return validarResumenSolicitud(data)
}

export async function listarFacturasFel(token, opciones = {}) {
  const parametros = {}

  if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
  if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
  if (opciones.busqueda !== undefined) parametros.p_busqueda = opciones.busqueda
  if (opciones.estado !== undefined) parametros.p_estado = opciones.estado
  if (opciones.fechaDesde !== undefined) {
    parametros.p_fecha_desde = opciones.fechaDesde
  }
  if (opciones.fechaHasta !== undefined) {
    parametros.p_fecha_hasta = opciones.fechaHasta
  }

  const data = await ejecutarRpcAutenticada(
    token,
    'listar_facturas_fel',
    parametros,
  )

  if (
    !esObjeto(data) ||
    !Array.isArray(data.facturas) ||
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

export async function obtenerFacturaFel(token, facturaId) {
  const data = await ejecutarRpcAutenticada(token, 'obtener_factura_fel', {
    p_factura_id: facturaId,
  })

  if (!esObjeto(data) || !esObjeto(data.venta)) {
    throw crearErrorFormato()
  }

  return data
}

// Estas funciones no se publican como endpoints HTTP. Utilizan el cliente
// administrativo del backend y RPC concedidas exclusivamente a service_role.
export async function reclamarFacturaFel(facturaId, xmlSolicitud) {
  const data = await ejecutarRpcWorker('reclamar_factura_fel', {
    p_factura_id: facturaId,
    p_xml_solicitud: xmlSolicitud,
  })

  if (
    !esObjeto(data) ||
    typeof data.reclamada !== 'boolean' ||
    !esObjeto(data.factura)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function finalizarFacturaFel(
  facturaId,
  tokenProcesamiento,
  resultado,
) {
  const data = await ejecutarRpcWorker('finalizar_factura_fel', {
    p_factura_id: facturaId,
    p_token_procesamiento: tokenProcesamiento,
    p_resultado: resultado.tipo,
    p_uuid_fel: resultado.uuid_fel ?? null,
    p_serie_fel: resultado.serie_fel ?? null,
    p_numero_fel: resultado.numero_fel ?? null,
    p_fecha_certificacion: resultado.fecha_certificacion ?? null,
    p_xml_certificado: resultado.xml_certificado ?? null,
    p_respuesta_certificador: resultado.respuesta_certificador ?? null,
    p_mensaje_error: resultado.mensaje_error ?? null,
    p_pdf_storage_path: resultado.pdf_storage_path ?? null,
  })

  if (!esObjeto(data) || !esObjeto(data.factura)) {
    throw crearErrorFormato()
  }

  return data
}
