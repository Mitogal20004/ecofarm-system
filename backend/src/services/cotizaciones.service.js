import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioCotizaciones extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioCotizaciones'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioCotizaciones(
    'Supabase devolvió una respuesta de cotizaciones con formato inválido.',
  )

async function ejecutarRpcCotizaciones(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioCotizaciones(
        'No fue posible completar la operación de cotizaciones en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioCotizaciones) throw error

    throw new ErrorServicioCotizaciones(
      'No fue posible completar la operación de cotizaciones en Supabase.',
      error,
    )
  }
}

const validarResumenCotizacion = (data) => {
  if (!esObjeto(data) || !esObjeto(data.cotizacion)) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarCotizaciones(token, opciones = {}) {
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

  const data = await ejecutarRpcCotizaciones(
    token,
    'listar_cotizaciones',
    parametros,
  )

  if (
    !esObjeto(data) ||
    !Array.isArray(data.cotizaciones) ||
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

export async function obtenerCotizacion(token, cotizacionId) {
  const data = await ejecutarRpcCotizaciones(token, 'obtener_cotizacion', {
    p_cotizacion_id: cotizacionId,
  })

  if (
    !esObjeto(data) ||
    !esObjeto(data.cotizacion) ||
    !Array.isArray(data.detalles)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function crearCotizacion(token, datos) {
  const data = await ejecutarRpcCotizaciones(token, 'crear_cotizacion', {
    p_cliente_id: datos.cliente_id,
    p_comprador_nombre: datos.comprador_nombre,
    p_comprador_nit: datos.comprador_nit,
    p_comprador_direccion: datos.comprador_direccion,
    p_observaciones: datos.observaciones,
    p_detalles: datos.detalles,
  })

  return validarResumenCotizacion(data)
}

export async function actualizarCotizacion(token, cotizacionId, datos) {
  const data = await ejecutarRpcCotizaciones(token, 'actualizar_cotizacion', {
    p_cotizacion_id: cotizacionId,
    p_cliente_id: datos.cliente_id,
    p_comprador_nombre: datos.comprador_nombre,
    p_comprador_nit: datos.comprador_nit,
    p_comprador_direccion: datos.comprador_direccion,
    p_observaciones: datos.observaciones,
    p_detalles: datos.detalles,
  })

  return validarResumenCotizacion(data)
}

export async function cambiarEstadoCotizacion(
  token,
  cotizacionId,
  estado,
) {
  const data = await ejecutarRpcCotizaciones(
    token,
    'cambiar_estado_cotizacion',
    {
      p_cotizacion_id: cotizacionId,
      p_estado: estado,
    },
  )

  if (
    !esObjeto(data) ||
    !esObjeto(data.cotizacion) ||
    typeof data.cambio !== 'boolean'
  ) {
    throw crearErrorFormato()
  }

  return data
}
