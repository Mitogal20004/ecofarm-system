import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioInventario extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioInventario'
    this.codigo = causa?.code ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioInventario(
    'Supabase devolvió una respuesta de inventario con formato inválido.',
  )

async function ejecutarRpcInventario(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioInventario(
        'No fue posible completar la operación de inventario en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioInventario) throw error

    throw new ErrorServicioInventario(
      'No fue posible completar la operación de inventario en Supabase.',
      error,
    )
  }
}

const validarPaginacion = (paginacion) =>
  esObjeto(paginacion) &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

const validarResultadoMovimiento = (data) => {
  if (
    !esObjeto(data) ||
    typeof data.cambio !== 'boolean' ||
    !esObjeto(data.existencia) ||
    (data.cambio && !esObjeto(data.movimiento))
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarInventario(token, opciones = {}) {
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
  if (opciones.estadoStock !== undefined) {
    parametros.p_estado_stock = opciones.estadoStock
  }
  if (opciones.activo !== undefined) parametros.p_activo = opciones.activo

  const data = await ejecutarRpcInventario(
    token,
    'listar_inventario_snapdragon',
    parametros,
  )

  if (
    !esObjeto(data) ||
    !Array.isArray(data.inventario) ||
    !Array.isArray(data.presentaciones) ||
    !esObjeto(data.resumen) ||
    !validarPaginacion(data.paginacion)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function listarMovimientos(token, opciones = {}) {
  const parametros = {}

  if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
  if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
  if (opciones.busqueda !== undefined) parametros.p_busqueda = opciones.busqueda
  if (opciones.varianteId !== undefined) {
    parametros.p_variante_id = opciones.varianteId
  }
  if (opciones.tipo !== undefined) parametros.p_tipo = opciones.tipo
  if (opciones.fechaDesde !== undefined) {
    parametros.p_fecha_desde = opciones.fechaDesde
  }
  if (opciones.fechaHasta !== undefined) {
    parametros.p_fecha_hasta = opciones.fechaHasta
  }
  if (opciones.usuarioId !== undefined) {
    parametros.p_usuario_id = opciones.usuarioId
  }

  const data = await ejecutarRpcInventario(
    token,
    'listar_movimientos_inventario',
    parametros,
  )

  if (
    !esObjeto(data) ||
    !Array.isArray(data.movimientos) ||
    !validarPaginacion(data.paginacion)
  ) {
    throw crearErrorFormato()
  }

  return data
}

export async function registrarEntrada(token, datos) {
  const data = await ejecutarRpcInventario(
    token,
    'registrar_entrada_inventario',
    {
      p_variante_id: datos.variante_id,
      p_cantidad_manojos: datos.cantidad_manojos,
      p_motivo: datos.motivo,
    },
  )

  return validarResultadoMovimiento(data)
}

export async function registrarSalida(token, datos) {
  const data = await ejecutarRpcInventario(
    token,
    'registrar_salida_inventario',
    {
      p_variante_id: datos.variante_id,
      p_cantidad_manojos: datos.cantidad_manojos,
      p_motivo: datos.motivo,
    },
  )

  return validarResultadoMovimiento(data)
}

export async function registrarAjuste(token, datos) {
  const data = await ejecutarRpcInventario(
    token,
    'registrar_ajuste_inventario',
    {
      p_variante_id: datos.variante_id,
      p_conteo_fisico_manojos: datos.conteo_fisico_manojos,
      p_motivo: datos.motivo,
    },
  )

  return validarResultadoMovimiento(data)
}

export async function actualizarStockMinimo(token, varianteId, stockMinimo) {
  const data = await ejecutarRpcInventario(
    token,
    'actualizar_stock_minimo_inventario',
    {
      p_variante_id: varianteId,
      p_stock_minimo_manojos: stockMinimo,
    },
  )

  if (!esObjeto(data) || !esObjeto(data.existencia)) {
    throw crearErrorFormato()
  }

  return data
}
