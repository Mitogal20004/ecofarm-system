import {
  ErrorServicioClientes,
  actualizarCliente as actualizarClienteServicio,
  crearCliente as crearClienteServicio,
  listarClientes as listarClientesServicio,
  obtenerDetalleCliente as obtenerDetalleClienteServicio,
} from '../services/clientes.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIPOS_CLIENTE = new Set(['individual', 'empresa'])
const CAMPOS_CLIENTE = new Set([
  'tipo',
  'nombre_completo',
  'razon_social',
  'nit',
  'telefono',
  'correo_electronico',
  'direccion',
])
const CAMPOS_ACTUALIZACION = new Set([...CAMPOS_CLIENTE, 'activo'])

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const normalizarEspacios = (valor) => valor.trim().replace(/\s+/g, ' ')

const convertirEnteroPositivo = (valor) => {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const numero = Number(valor)

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorSolicitudInvalida()
  }

  return numero
}

const validarClienteId = (clienteId) => {
  if (typeof clienteId !== 'string' || !PATRON_UUID.test(clienteId)) {
    throw new ErrorSolicitudInvalida()
  }
}

const respuestasPorCodigo = {
  42501: {
    estado: 403,
    mensaje: 'No tiene permiso para realizar esta acción',
  },
  22023: {
    estado: 400,
    mensaje: MENSAJE_SOLICITUD_INVALIDA,
  },
  P0002: {
    estado: 404,
    mensaje: 'El cliente solicitado no existe',
  },
  23505: {
    estado: 409,
    mensaje: 'Ya existe un cliente con el NIT proporcionado',
  },
  23514: {
    estado: 400,
    mensaje: MENSAJE_SOLICITUD_INVALIDA,
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({
      ok: false,
      message: MENSAJE_SOLICITUD_INVALIDA,
    })
  }

  if (error instanceof ErrorServicioClientes) {
    const respuesta = respuestasPorCodigo[error.codigo]

    if (respuesta) {
      return res.status(respuesta.estado).json({
        ok: false,
        message: respuesta.mensaje,
      })
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

const crearOpcionesListado = (query) => {
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroPositivo(query.pagina)
  }

  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroPositivo(query.limite)

    if (opciones.limite > 100) {
      throw new ErrorSolicitudInvalida()
    }
  }

  if (query.busqueda !== undefined) {
    if (
      typeof query.busqueda !== 'string' ||
      normalizarEspacios(query.busqueda).length > 150
    ) {
      throw new ErrorSolicitudInvalida()
    }

    opciones.busqueda = query.busqueda
  }

  if (query.activo !== undefined) {
    if (query.activo === 'true') {
      opciones.activo = true
    } else if (query.activo === 'false') {
      opciones.activo = false
    } else {
      throw new ErrorSolicitudInvalida()
    }
  }

  if (query.tipo !== undefined) {
    if (typeof query.tipo !== 'string' || !TIPOS_CLIENTE.has(query.tipo)) {
      throw new ErrorSolicitudInvalida()
    }

    opciones.tipo = query.tipo
  }

  return opciones
}

const validarCampos = (body, camposPermitidos, permitirVacio = false) => {
  if (!esObjeto(body)) {
    throw new ErrorSolicitudInvalida()
  }

  const campos = Object.keys(body)

  if (
    (!permitirVacio && campos.length === 0) ||
    campos.some((campo) => !camposPermitidos.has(campo))
  ) {
    throw new ErrorSolicitudInvalida()
  }
}

const normalizarTextoNullable = (valor, limite) => {
  if (valor === undefined || valor === null) {
    return null
  }

  if (typeof valor !== 'string') {
    throw new ErrorSolicitudInvalida()
  }

  const normalizado = normalizarEspacios(valor)

  if (normalizado.length > limite) {
    throw new ErrorSolicitudInvalida()
  }

  return normalizado || null
}

const normalizarDatosCliente = (body) => {
  if (
    typeof body.tipo !== 'string' ||
    typeof body.nit !== 'string' ||
    typeof body.direccion !== 'string' ||
    !TIPOS_CLIENTE.has(body.tipo)
  ) {
    throw new ErrorSolicitudInvalida()
  }

  const nombreCompleto = normalizarTextoNullable(body.nombre_completo, 150)
  const razonSocial = normalizarTextoNullable(body.razon_social, 200)
  const nit = body.nit.trim().toUpperCase().replace(/[\s-]+/g, '')
  const direccion = normalizarEspacios(body.direccion)
  const telefono = normalizarTextoNullable(body.telefono, 30)
  const correoElectronico = normalizarTextoNullable(
    body.correo_electronico,
    254,
  )?.toLowerCase() ?? null

  if (
    !nit ||
    nit.length > 30 ||
    !direccion ||
    direccion.length > 500 ||
    (correoElectronico !== null && !PATRON_EMAIL.test(correoElectronico)) ||
    (body.tipo === 'individual' &&
      (nombreCompleto === null || razonSocial !== null)) ||
    (body.tipo === 'empresa' &&
      (razonSocial === null || nombreCompleto !== null))
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return {
    tipo: body.tipo,
    nombre_completo: nombreCompleto,
    razon_social: razonSocial,
    nit,
    telefono,
    correo_electronico: correoElectronico,
    direccion,
  }
}

const crearCambiosCliente = (body) => {
  validarCampos(body, CAMPOS_ACTUALIZACION)
  const cambios = {}

  for (const [campo, valor] of Object.entries(body)) {
    if (campo === 'activo') {
      if (typeof valor !== 'boolean') {
        throw new ErrorSolicitudInvalida()
      }

      cambios.activo = valor
    } else if (campo === 'tipo') {
      if (typeof valor !== 'string' || !TIPOS_CLIENTE.has(valor)) {
        throw new ErrorSolicitudInvalida()
      }

      cambios.tipo = valor
    } else if (campo === 'nit') {
      if (typeof valor !== 'string') {
        throw new ErrorSolicitudInvalida()
      }

      cambios.nit = valor.trim().toUpperCase().replace(/[\s-]+/g, '')

      if (!cambios.nit || cambios.nit.length > 30) {
        throw new ErrorSolicitudInvalida()
      }
    } else if (campo === 'direccion') {
      if (typeof valor !== 'string') {
        throw new ErrorSolicitudInvalida()
      }

      cambios.direccion = normalizarEspacios(valor)

      if (!cambios.direccion || cambios.direccion.length > 500) {
        throw new ErrorSolicitudInvalida()
      }
    } else if (campo === 'correo_electronico') {
      cambios.correo_electronico = normalizarTextoNullable(valor, 254)
        ?.toLowerCase() ?? null

      if (
        cambios.correo_electronico !== null &&
        !PATRON_EMAIL.test(cambios.correo_electronico)
      ) {
        throw new ErrorSolicitudInvalida()
      }
    } else {
      const limite = campo === 'razon_social' ? 200 : campo === 'telefono' ? 30 : 150
      cambios[campo] = normalizarTextoNullable(valor, limite)
    }
  }

  return cambios
}

export async function listarClientes(req, res) {
  try {
    const opciones = crearOpcionesListado(req.query)
    const resultado = await listarClientesServicio(
      req.autenticacion?.token,
      opciones,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function obtenerDetalleCliente(req, res) {
  try {
    validarClienteId(req.params.clienteId)
    const resultado = await obtenerDetalleClienteServicio(
      req.autenticacion?.token,
      req.params.clienteId,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function crearCliente(req, res) {
  try {
    validarCampos(req.body, CAMPOS_CLIENTE)

    if (
      !Object.prototype.hasOwnProperty.call(req.body, 'tipo') ||
      !Object.prototype.hasOwnProperty.call(req.body, 'nit') ||
      !Object.prototype.hasOwnProperty.call(req.body, 'direccion')
    ) {
      throw new ErrorSolicitudInvalida()
    }

    const datos = normalizarDatosCliente(req.body)
    const resultado = await crearClienteServicio(
      req.autenticacion?.token,
      datos,
    )

    return res.status(201).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}

export async function actualizarCliente(req, res) {
  try {
    validarClienteId(req.params.clienteId)
    const cambios = crearCambiosCliente(req.body)
    const resultado = await actualizarClienteServicio(
      req.autenticacion?.token,
      req.params.clienteId,
      cambios,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    return responderError(res, error)
  }
}
