import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioClientes extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioClientes'
    this.codigo = causa?.code ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioClientes(
    'Supabase devolvió una respuesta de clientes con formato inválido.',
  )

async function ejecutarRpcClientes(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioClientes(
        'No fue posible completar la operación de clientes en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioClientes) {
      throw error
    }

    throw new ErrorServicioClientes(
      'No fue posible completar la operación de clientes en Supabase.',
      error,
    )
  }
}

const validarCliente = (data) => {
  if (!esObjeto(data) || !esObjeto(data.cliente)) {
    throw crearErrorFormato()
  }

  return { cliente: data.cliente }
}

export async function listarClientes(token, opciones = {}) {
  const parametros = {}

  if (opciones.pagina !== undefined) {
    parametros.p_pagina = opciones.pagina
  }

  if (opciones.limite !== undefined) {
    parametros.p_limite = opciones.limite
  }

  if (opciones.busqueda !== undefined) {
    parametros.p_busqueda = opciones.busqueda
  }

  if (opciones.activo !== undefined) {
    parametros.p_activo = opciones.activo
  }

  if (opciones.tipo !== undefined) {
    parametros.p_tipo = opciones.tipo
  }

  const data = await ejecutarRpcClientes(token, 'listar_clientes', parametros)

  if (
    !esObjeto(data) ||
    !Array.isArray(data.clientes) ||
    !esObjeto(data.paginacion) ||
    !Number.isInteger(data.paginacion.pagina) ||
    !Number.isInteger(data.paginacion.limite) ||
    !Number.isInteger(data.paginacion.total) ||
    !Number.isInteger(data.paginacion.total_paginas)
  ) {
    throw crearErrorFormato()
  }

  return {
    clientes: data.clientes,
    paginacion: data.paginacion,
  }
}

export async function obtenerDetalleCliente(token, clienteId) {
  const data = await ejecutarRpcClientes(token, 'obtener_detalle_cliente', {
    p_cliente_id: clienteId,
  })

  return validarCliente(data)
}

export async function crearCliente(token, datos) {
  const data = await ejecutarRpcClientes(token, 'crear_cliente', {
    p_tipo: datos.tipo,
    p_nombre_completo: datos.nombre_completo,
    p_razon_social: datos.razon_social,
    p_nit: datos.nit,
    p_telefono: datos.telefono,
    p_correo_electronico: datos.correo_electronico,
    p_direccion: datos.direccion,
  })

  return validarCliente(data)
}

export async function actualizarCliente(token, clienteId, cambios) {
  const data = await ejecutarRpcClientes(token, 'actualizar_cliente', {
    p_cliente_id: clienteId,
    p_cambios: cambios,
  })

  return validarCliente(data)
}
