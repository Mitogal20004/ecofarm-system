import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioReportes extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioReportes'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioReportes(
    'Supabase devolvió una respuesta de reportes con formato inválido.',
  )

const validarPaginacion = (paginacion) =>
  esObjeto(paginacion) &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

export function crearServicioReportes({
  crearCliente = crearClienteSupabaseAutenticado,
} = {}) {
  async function ejecutarRpc(token, nombre, parametros) {
    try {
      const supabaseAutenticado = crearCliente(token)
      const { data, error } = await supabaseAutenticado.rpc(
        nombre,
        parametros,
      )

      if (error) {
        throw new ErrorServicioReportes(
          'No fue posible consultar el reporte en Supabase.',
          error,
        )
      }

      return data
    } catch (error) {
      if (error instanceof ErrorServicioReportes) throw error

      throw new ErrorServicioReportes(
        'No fue posible consultar el reporte en Supabase.',
        error,
      )
    }
  }

  async function obtenerReporteVentas(token, opciones) {
    const parametros = {
      p_fecha_desde: opciones.fechaDesde,
      p_fecha_hasta: opciones.fechaHasta,
    }

    if (opciones.clienteId !== undefined) {
      parametros.p_cliente_id = opciones.clienteId
    }
    if (opciones.serie !== undefined) parametros.p_serie = opciones.serie
    if (opciones.usuarioId !== undefined) {
      parametros.p_usuario_id = opciones.usuarioId
    }

    const data = await ejecutarRpc(
      token,
      'obtener_reporte_ventas',
      parametros,
    )

    if (
      !esObjeto(data) ||
      !esObjeto(data.resumen) ||
      !Array.isArray(data.serie) ||
      !esObjeto(data.filtros)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function listarProductosVendidos(token, opciones) {
    const parametros = {
      p_fecha_desde: opciones.fechaDesde,
      p_fecha_hasta: opciones.fechaHasta,
    }

    if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
    if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
    if (opciones.varianteId !== undefined) {
      parametros.p_variante_id = opciones.varianteId
    }
    if (opciones.presentacionId !== undefined) {
      parametros.p_presentacion_id = opciones.presentacionId
    }

    const data = await ejecutarRpc(
      token,
      'listar_reporte_productos_vendidos',
      parametros,
    )

    if (
      !esObjeto(data) ||
      !Array.isArray(data.productos) ||
      !validarPaginacion(data.paginacion) ||
      !esObjeto(data.filtros)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerReporteInventario(token, opciones) {
    const parametros = {}

    if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
    if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
    if (opciones.busqueda !== undefined) {
      parametros.p_busqueda = opciones.busqueda
    }
    if (opciones.longitudCm !== undefined) {
      parametros.p_longitud_cm = opciones.longitudCm
    }
    if (opciones.clasificacion !== undefined) {
      parametros.p_clasificacion = opciones.clasificacion
    }
    if (opciones.estadoStock !== undefined) {
      parametros.p_estado_stock = opciones.estadoStock
    }
    if (opciones.activo !== undefined) parametros.p_activo = opciones.activo

    const data = await ejecutarRpc(
      token,
      'obtener_reporte_inventario',
      parametros,
    )

    if (
      !esObjeto(data) ||
      !esObjeto(data.resumen) ||
      !Array.isArray(data.inventario) ||
      !validarPaginacion(data.paginacion) ||
      !esObjeto(data.filtros)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerReporteMovimientosInventario(token, opciones) {
    const parametros = {
      p_fecha_desde: opciones.fechaDesde,
      p_fecha_hasta: opciones.fechaHasta,
    }

    if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
    if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
    if (opciones.busqueda !== undefined) {
      parametros.p_busqueda = opciones.busqueda
    }
    if (opciones.varianteId !== undefined) {
      parametros.p_variante_id = opciones.varianteId
    }
    if (opciones.tipo !== undefined) parametros.p_tipo = opciones.tipo
    if (opciones.origen !== undefined) parametros.p_origen = opciones.origen
    if (opciones.usuarioId !== undefined) {
      parametros.p_usuario_id = opciones.usuarioId
    }

    const data = await ejecutarRpc(
      token,
      'obtener_reporte_movimientos_inventario',
      parametros,
    )

    if (
      !esObjeto(data) ||
      !esObjeto(data.resumen) ||
      !Array.isArray(data.movimientos) ||
      !validarPaginacion(data.paginacion) ||
      !esObjeto(data.filtros)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerReporteCotizaciones(token, opciones) {
    const parametros = {
      p_fecha_desde: opciones.fechaDesde,
      p_fecha_hasta: opciones.fechaHasta,
    }

    if (opciones.clienteId !== undefined) {
      parametros.p_cliente_id = opciones.clienteId
    }
    if (opciones.serie !== undefined) parametros.p_serie = opciones.serie
    if (opciones.usuarioId !== undefined) {
      parametros.p_usuario_id = opciones.usuarioId
    }

    const data = await ejecutarRpc(
      token,
      'obtener_reporte_cotizaciones',
      parametros,
    )

    if (
      !esObjeto(data) ||
      !esObjeto(data.resumen) ||
      !Array.isArray(data.estados) ||
      !esObjeto(data.filtros)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  return Object.freeze({
    obtenerReporteVentas,
    listarProductosVendidos,
    obtenerReporteInventario,
    obtenerReporteMovimientosInventario,
    obtenerReporteCotizaciones,
  })
}

const servicioReportes = crearServicioReportes()

export const obtenerReporteVentas = servicioReportes.obtenerReporteVentas
export const listarProductosVendidos =
  servicioReportes.listarProductosVendidos
export const obtenerReporteInventario =
  servicioReportes.obtenerReporteInventario
export const obtenerReporteMovimientosInventario =
  servicioReportes.obtenerReporteMovimientosInventario
export const obtenerReporteCotizaciones =
  servicioReportes.obtenerReporteCotizaciones
