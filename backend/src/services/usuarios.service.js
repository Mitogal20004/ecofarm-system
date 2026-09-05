import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

export class ErrorServicioUsuarios extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioUsuarios'
    this.codigo = causa?.code ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioUsuarios(
    'Supabase devolvió una respuesta de usuarios con formato inválido.',
  )

async function ejecutarRpcUsuarios(token, nombre, parametros) {
  try {
    const supabaseAutenticado = crearClienteSupabaseAutenticado(token)
    const consulta = parametros
      ? supabaseAutenticado.rpc(nombre, parametros)
      : supabaseAutenticado.rpc(nombre)
    const { data, error } = await consulta

    if (error) {
      throw new ErrorServicioUsuarios(
        'No fue posible completar la operación de usuarios en Supabase.',
        error,
      )
    }

    return data
  } catch (error) {
    if (error instanceof ErrorServicioUsuarios) {
      throw error
    }

    throw new ErrorServicioUsuarios(
      'No fue posible completar la operación de usuarios en Supabase.',
      error,
    )
  }
}

export async function listarUsuarios(token, opciones = {}) {
  const parametros = {}
  const opcionesRecibidas = opciones ?? {}

  if (opcionesRecibidas.pagina !== undefined) {
    parametros.p_pagina = opcionesRecibidas.pagina
  }

  if (opcionesRecibidas.limite !== undefined) {
    parametros.p_limite = opcionesRecibidas.limite
  }

  if (opcionesRecibidas.busqueda !== undefined) {
    parametros.p_busqueda = opcionesRecibidas.busqueda
  }

  if (opcionesRecibidas.activo !== undefined) {
    parametros.p_activo = opcionesRecibidas.activo
  }

  const data = await ejecutarRpcUsuarios(token, 'listar_usuarios', parametros)

  if (
    !esObjeto(data) ||
    !Array.isArray(data.usuarios) ||
    !esObjeto(data.paginacion) ||
    !Number.isInteger(data.paginacion.pagina) ||
    !Number.isInteger(data.paginacion.limite) ||
    !Number.isInteger(data.paginacion.total) ||
    !Number.isInteger(data.paginacion.total_paginas)
  ) {
    throw crearErrorFormato()
  }

  return {
    usuarios: data.usuarios,
    paginacion: {
      pagina: data.paginacion.pagina,
      limite: data.paginacion.limite,
      total: data.paginacion.total,
      total_paginas: data.paginacion.total_paginas,
    },
  }
}

export async function obtenerDetalleUsuario(token, usuarioId) {
  const data = await ejecutarRpcUsuarios(token, 'obtener_detalle_usuario', {
    p_usuario_id: usuarioId,
  })

  if (!esObjeto(data) || !esObjeto(data.usuario) || !Array.isArray(data.roles)) {
    throw crearErrorFormato()
  }

  return {
    usuario: data.usuario,
    roles: data.roles,
  }
}

export async function actualizarPerfilUsuario(token, usuarioId, cambios) {
  const data = await ejecutarRpcUsuarios(token, 'actualizar_perfil_usuario', {
    p_usuario_id: usuarioId,
    p_cambios: cambios,
  })

  if (!esObjeto(data) || !esObjeto(data.perfil)) {
    throw crearErrorFormato()
  }

  return {
    perfil: data.perfil,
  }
}

export async function reemplazarRolesUsuario(token, usuarioId, rolesIds) {
  const data = await ejecutarRpcUsuarios(token, 'reemplazar_roles_usuario', {
    p_usuario_id: usuarioId,
    p_roles_ids: rolesIds,
  })

  if (
    !esObjeto(data) ||
    typeof data.usuario_id !== 'string' ||
    !Array.isArray(data.roles)
  ) {
    throw crearErrorFormato()
  }

  return {
    usuario_id: data.usuario_id,
    roles: data.roles,
  }
}
