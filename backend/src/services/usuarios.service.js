import {
  crearClienteSupabaseAutenticado,
  supabaseAdmin,
} from '../lib/supabase.js'

const CODIGO_CONFLICTO_USUARIO = 'conflicto_usuario'
const CODIGO_CONFLICTO_SERIE_DOCUMENTOS = 'conflicto_serie_documentos'
const CODIGO_COMPENSACION_FALLIDA = 'compensacion_usuario_fallida'
const CODIGOS_CONFLICTO_AUTH = new Set([
  'email_exists',
  'user_already_exists',
])
const CODIGOS_SOLICITUD_INVALIDA_AUTH = new Set([
  'email_address_invalid',
  'validation_failed',
  'weak_password',
])

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const esConflictoSerieDocumentos = (error) =>
  error?.code === '23505' &&
  /perfiles_serie_documentos_unica|serie de documentos/i.test(
    [error?.message, error?.details, error?.hint].filter(Boolean).join(' '),
  )

export class ErrorServicioUsuarios extends Error {
  constructor(mensaje, causa, codigo = causa?.code ?? null) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioUsuarios'
    this.codigo = codigo
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
        esConflictoSerieDocumentos(error)
          ? CODIGO_CONFLICTO_SERIE_DOCUMENTOS
          : error.code,
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

const crearErrorAuth = (error) => {
  if (CODIGOS_CONFLICTO_AUTH.has(error?.code)) {
    return new ErrorServicioUsuarios(
      'La identidad solicitada ya existe en Supabase Auth.',
      error,
      CODIGO_CONFLICTO_USUARIO,
    )
  }

  if (CODIGOS_SOLICITUD_INVALIDA_AUTH.has(error?.code)) {
    return new ErrorServicioUsuarios(
      'Supabase Auth rechazó los datos proporcionados.',
      error,
      '22023',
    )
  }

  return new ErrorServicioUsuarios(
    'No fue posible crear la identidad en Supabase Auth.',
    error,
  )
}

async function compensarIdentidadAuth(usuarioId, errorOrigen) {
  let errorCompensacion

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(usuarioId)
    errorCompensacion = error
  } catch (error) {
    errorCompensacion = error
  }

  if (!errorCompensacion) {
    return true
  }

  console.error('Falló la compensación de una identidad de usuario.', {
    usuarioId,
    codigoOrigen: errorOrigen?.codigo ?? null,
    codigoCompensacion: errorCompensacion?.code ?? null,
    estadoCompensacion: errorCompensacion?.status ?? null,
  })

  return false
}

export async function crearUsuario(token, datos) {
  let usuarioAuth

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: datos.email,
      password: datos.password,
      email_confirm: true,
    })

    if (error) {
      throw crearErrorAuth(error)
    }

    if (!data?.user?.id) {
      throw crearErrorFormato()
    }

    usuarioAuth = data.user
  } catch (error) {
    if (error instanceof ErrorServicioUsuarios) {
      throw error
    }

    throw new ErrorServicioUsuarios(
      'No fue posible crear la identidad en Supabase Auth.',
      error,
    )
  }

  let data

  try {
    data = await ejecutarRpcUsuarios(token, 'crear_perfil_usuario', {
      p_usuario_id: usuarioAuth.id,
      p_nombre_completo: datos.nombre_completo,
      p_nombre_usuario: datos.nombre_usuario,
      p_telefono: datos.telefono,
      p_rol_id: datos.rol_id,
      p_serie_documentos: datos.serie_documentos,
    })

    if (!esObjeto(data) || !esObjeto(data.perfil) || !esObjeto(data.rol)) {
      throw crearErrorFormato()
    }
  } catch (error) {
    const errorRpc =
      error instanceof ErrorServicioUsuarios
        ? error
        : new ErrorServicioUsuarios(
            'No fue posible crear el perfil del usuario.',
            error,
          )
    const compensacionExitosa = await compensarIdentidadAuth(
      usuarioAuth.id,
      errorRpc,
    )

    if (!compensacionExitosa) {
      throw new ErrorServicioUsuarios(
        'No fue posible compensar la creación incompleta del usuario.',
        errorRpc,
        CODIGO_COMPENSACION_FALLIDA,
      )
    }

    throw errorRpc
  }

  return {
    usuario: {
      id: data.perfil.id,
      nombre_completo: data.perfil.nombre_completo,
      nombre_usuario: data.perfil.nombre_usuario,
      email: usuarioAuth.email ?? datos.email,
      telefono: data.perfil.telefono,
      serie_documentos: data.perfil.serie_documentos,
      activo: data.perfil.activo,
      roles: [data.rol],
    },
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
