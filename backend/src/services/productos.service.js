import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioProductos extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioProductos'
    this.codigo = causa?.code ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioProductos(
    'Supabase devolvió una respuesta de productos con formato inválido.',
  )

async function ejecutarRpcProductos(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioProductos(
        'No fue posible completar la operación de productos en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioProductos) {
      throw error
    }

    throw new ErrorServicioProductos(
      'No fue posible completar la operación de productos en Supabase.',
      error,
    )
  }
}

const validarVariante = (data) => {
  if (!esObjeto(data) || !esObjeto(data.variante)) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarVariantes(token, opciones = {}) {
  const parametros = {}

  if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
  if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
  if (opciones.busqueda !== undefined) parametros.p_busqueda = opciones.busqueda
  if (opciones.longitudCm !== undefined) {
    parametros.p_longitud_cm = opciones.longitudCm
  }
  if (opciones.clasificacion !== undefined) {
    parametros.p_clasificacion = opciones.clasificacion
  }
  if (opciones.activo !== undefined) parametros.p_activo = opciones.activo

  const data = await ejecutarRpcProductos(
    token,
    'listar_variantes_snapdragon',
    parametros,
  )

  if (
    !esObjeto(data) ||
    !esObjeto(data.producto) ||
    !Array.isArray(data.variantes) ||
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

export async function listarPresentaciones(token) {
  const data = await ejecutarRpcProductos(
    token,
    'listar_presentaciones_producto',
  )

  if (!esObjeto(data) || !Array.isArray(data.presentaciones)) {
    throw crearErrorFormato()
  }

  return data
}

export async function obtenerDetalleVariante(token, varianteId) {
  const data = await ejecutarRpcProductos(
    token,
    'obtener_detalle_variante_producto',
    { p_variante_id: varianteId },
  )

  if (
    !esObjeto(data) ||
    !esObjeto(data.producto) ||
    !esObjeto(data.variante) ||
    !Array.isArray(data.precios)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function crearVariante(token, datos) {
  const data = await ejecutarRpcProductos(token, 'crear_variante_snapdragon', {
    p_codigo_sku: datos.codigo_sku,
    p_color: datos.color,
    p_longitud_cm: datos.longitud_cm,
    p_clasificacion: datos.clasificacion,
    p_observaciones: datos.observaciones,
  })

  return validarVariante(data)
}

export async function actualizarVariante(token, varianteId, cambios) {
  const data = await ejecutarRpcProductos(
    token,
    'actualizar_variante_producto',
    {
      p_variante_id: varianteId,
      p_cambios: cambios,
    },
  )

  return validarVariante(data)
}

export async function obtenerPreciosVigentes(token, varianteId) {
  const data = await ejecutarRpcProductos(
    token,
    'obtener_precios_vigentes_variante',
    { p_variante_id: varianteId },
  )

  if (!esObjeto(data) || !Array.isArray(data.precios)) {
    throw crearErrorFormato()
  }

  return data
}

export async function registrarPrecio(token, varianteId, datos) {
  const data = await ejecutarRpcProductos(token, 'registrar_precio_variante', {
    p_variante_id: varianteId,
    p_presentacion_id: datos.presentacion_id,
    p_precio: datos.precio,
  })

  if (!esObjeto(data) || !esObjeto(data.precio)) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarHistorialPrecios(
  token,
  varianteId,
  presentacionId,
) {
  const parametros = { p_variante_id: varianteId }

  if (presentacionId !== undefined) {
    parametros.p_presentacion_id = presentacionId
  }

  const data = await ejecutarRpcProductos(
    token,
    'listar_historial_precios_variante',
    parametros,
  )

  if (!esObjeto(data) || !Array.isArray(data.historial)) {
    throw crearErrorFormato()
  }

  return data
}
