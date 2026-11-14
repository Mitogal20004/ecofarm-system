import {
  ErrorServicioCaja,
  abrirCaja as abrirCajaServicio,
  cerrarCaja as cerrarCajaServicio,
  listarCajas as listarCajasServicio,
  obtenerCaja as obtenerCajaServicio,
  obtenerCajaActual as obtenerCajaActualServicio,
  obtenerEstadoDevolucionVenta as obtenerEstadoDevolucionVentaServicio,
  obtenerResumenCajaActual as obtenerResumenCajaActualServicio,
  registrarDevolucionVenta as registrarDevolucionVentaServicio,
} from '../services/caja.service.js'
import { emitirAlertaSinBloquear } from '../services/alertas.service.js'

const MENSAJE_SOLICITUD_INVALIDA = 'La solicitud contiene datos inválidos'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const PATRON_MONTO = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/
const MAXIMO_MONTO_CENTAVOS = 99999999999999n
const ESTADOS = new Set(['abierta', 'cerrada'])
const CAMPOS_APERTURA = new Set(['fondo_inicial'])
const CAMPOS_CIERRE = new Set(['efectivo_contado', 'observaciones'])
const CAMPOS_DEVOLUCION = new Set(['motivo'])
const CAMPOS_LISTADO = new Set([
  'pagina',
  'limite',
  'fecha_desde',
  'fecha_hasta',
  'usuario_id',
  'estado',
])

class ErrorSolicitudInvalida extends Error {}

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const normalizarEspacios = (valor) => valor.trim().replace(/\s+/g, ' ')

const validarCampos = (objeto, permitidos, requeridos) => {
  if (!esObjeto(objeto)) throw new ErrorSolicitudInvalida()

  const campos = Object.keys(objeto)
  if (
    campos.some((campo) => !permitidos.has(campo)) ||
    [...requeridos].some(
      (campo) => !Object.prototype.hasOwnProperty.call(objeto, campo),
    )
  ) {
    throw new ErrorSolicitudInvalida()
  }
}

const validarUuid = (valor) => {
  if (typeof valor !== 'string' || !PATRON_UUID.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
}

const normalizarMontoNoNegativo = (valor) => {
  let texto = ''
  if (typeof valor === 'number') texto = String(valor)
  if (typeof valor === 'string') texto = valor.trim()

  if (!PATRON_MONTO.test(texto)) {
    throw new ErrorSolicitudInvalida()
  }

  const [parteEntera, parteDecimal = ''] = texto.split('.')
  const centavos =
    BigInt(parteEntera) * 100n + BigInt(parteDecimal.padEnd(2, '0'))

  if (centavos > MAXIMO_MONTO_CENTAVOS) {
    throw new ErrorSolicitudInvalida()
  }

  return texto
}

const validarFecha = (valor) => {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) {
    throw new ErrorSolicitudInvalida()
  }

  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new ErrorSolicitudInvalida()
  }

  return valor
}

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

const crearDatosApertura = (body) => {
  validarCampos(body, CAMPOS_APERTURA, CAMPOS_APERTURA)
  return {
    fondo_inicial: normalizarMontoNoNegativo(body.fondo_inicial),
  }
}

const crearDatosCierre = (body) => {
  validarCampos(body, CAMPOS_CIERRE, new Set(['efectivo_contado']))

  let observaciones = null
  if (body.observaciones !== undefined && body.observaciones !== null) {
    if (typeof body.observaciones !== 'string') {
      throw new ErrorSolicitudInvalida()
    }
    observaciones = normalizarEspacios(body.observaciones) || null
    if (observaciones && observaciones.length > 1000) {
      throw new ErrorSolicitudInvalida()
    }
  }

  return {
    efectivo_contado: normalizarMontoNoNegativo(body.efectivo_contado),
    observaciones,
  }
}

const crearDatosDevolucion = (body) => {
  validarCampos(body, CAMPOS_DEVOLUCION, CAMPOS_DEVOLUCION)

  if (typeof body.motivo !== 'string') {
    throw new ErrorSolicitudInvalida()
  }

  const motivo = normalizarEspacios(body.motivo)
  if (!motivo || motivo.length > 500) {
    throw new ErrorSolicitudInvalida()
  }

  return { motivo }
}

const crearOpcionesListado = (query) => {
  validarCampos(query, CAMPOS_LISTADO, new Set())
  const opciones = {}

  if (query.pagina !== undefined) {
    opciones.pagina = convertirEnteroPositivo(query.pagina)
  }
  if (query.limite !== undefined) {
    opciones.limite = convertirEnteroPositivo(query.limite)
    if (opciones.limite > 100) throw new ErrorSolicitudInvalida()
  }
  if (query.fecha_desde !== undefined) {
    opciones.fechaDesde = validarFecha(query.fecha_desde)
  }
  if (query.fecha_hasta !== undefined) {
    opciones.fechaHasta = validarFecha(query.fecha_hasta)
  }
  if (
    opciones.fechaDesde &&
    opciones.fechaHasta &&
    opciones.fechaDesde > opciones.fechaHasta
  ) {
    throw new ErrorSolicitudInvalida()
  }
  if (query.usuario_id !== undefined) {
    opciones.usuarioId = validarUuid(query.usuario_id)
  }
  if (query.estado !== undefined) {
    if (typeof query.estado !== 'string') throw new ErrorSolicitudInvalida()
    opciones.estado = query.estado.trim().toLowerCase()
    if (!ESTADOS.has(opciones.estado)) throw new ErrorSolicitudInvalida()
  }

  return opciones
}

const mensajesSegurosSupabase = new Map([
  ['El usuario ya tiene una caja abierta.', 'Ya tienes una caja abierta.'],
  ['La caja ya fue cerrada.', 'La caja ya fue cerrada.'],
  ['La caja solicitada no existe.', 'La caja solicitada no existe.'],
  [
    'No tiene permiso para cerrar la caja de otro usuario.',
    'No tiene permiso para cerrar la caja de otro usuario.',
  ],
  [
    'No tiene permiso para consultar la caja de otro usuario.',
    'No tiene permiso para consultar la caja de otro usuario.',
  ],
  ['La Venta solicitada no existe.', 'La venta solicitada no existe.'],
  [
    'La clave de idempotencia ya fue utilizada.',
    'La clave de idempotencia ya fue utilizada.',
  ],
  [
    'La Venta ya tiene una devolucion de efectivo registrada.',
    'La venta ya tiene una devolución de efectivo registrada.',
  ],
  [
    'El usuario no tiene una caja abierta para registrar la devolucion.',
    'Debes abrir tu caja antes de registrar la devolución.',
  ],
  [
    'La Venta debe estar anulada antes de registrar la devolucion.',
    'La venta debe estar anulada antes de registrar la devolución.',
  ],
  [
    'La Venta no tiene un importe de efectivo que devolver.',
    'La venta no tiene un importe de efectivo que devolver.',
  ],
  [
    'La Venta no tiene un ingreso de Caja valido para devolver.',
    'La venta no tiene un ingreso de Caja válido para devolver.',
  ],
  [
    'La caja abierta no tiene suficiente efectivo esperado para registrar la devolucion.',
    'La caja abierta no tiene suficiente efectivo esperado para registrar la devolución.',
  ],
  [
    'Debe resolver el documento FEL asociado antes de registrar la devolucion.',
    'Debe resolver el documento FEL asociado antes de registrar la devolución.',
  ],
])

const respuestasPorCodigo = {
  42501: { estado: 403, mensaje: 'No tiene permiso para realizar esta acción' },
  22023: { estado: 400, mensaje: MENSAJE_SOLICITUD_INVALIDA },
  P0002: { estado: 404, mensaje: 'La caja solicitada no existe' },
  23505: { estado: 409, mensaje: 'La operación ya fue procesada.' },
  23514: {
    estado: 409,
    mensaje: 'La operación solicitada no puede realizarse.',
  },
}

const responderError = (res, error) => {
  if (error instanceof ErrorSolicitudInvalida) {
    return res.status(400).json({
      ok: false,
      message: MENSAJE_SOLICITUD_INVALIDA,
    })
  }

  if (error instanceof ErrorServicioCaja) {
    const respuesta = respuestasPorCodigo[error.codigo]
    if (respuesta) {
      return res.status(respuesta.estado).json({
        ok: false,
        message:
          mensajesSegurosSupabase.get(error.detalle) ?? respuesta.mensaje,
      })
    }
  }

  return res.status(500).json({
    ok: false,
    message: 'No fue posible completar la operación solicitada',
  })
}

const serviciosPredeterminados = Object.freeze({
  abrirCaja: abrirCajaServicio,
  obtenerCajaActual: obtenerCajaActualServicio,
  obtenerResumenCajaActual: obtenerResumenCajaActualServicio,
  cerrarCaja: cerrarCajaServicio,
  listarCajas: listarCajasServicio,
  obtenerCaja: obtenerCajaServicio,
  obtenerEstadoDevolucionVenta: obtenerEstadoDevolucionVentaServicio,
  registrarDevolucionVenta: registrarDevolucionVentaServicio,
})

export function crearControladoresCaja(servicios = serviciosPredeterminados) {
  return Object.freeze({
    async abrirCaja(req, res) {
      try {
        const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
        const datos = crearDatosApertura(req.body)
        const resultado = await servicios.abrirCaja(
          req.autenticacion?.token,
          claveIdempotencia,
          datos.fondo_inicial,
        )
        return res.status(resultado.cambio ? 201 : 200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async obtenerCajaActual(req, res) {
      try {
        const resultado = await servicios.obtenerCajaActual(
          req.autenticacion?.token,
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async obtenerResumenCajaActual(req, res) {
      try {
        const resultado = await servicios.obtenerResumenCajaActual(
          req.autenticacion?.token,
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async cerrarCaja(req, res) {
      try {
        const cajaTurnoId = validarUuid(req.params.cajaId)
        const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
        const datos = crearDatosCierre(req.body)
        const resultado = await servicios.cerrarCaja(
          req.autenticacion?.token,
          cajaTurnoId,
          claveIdempotencia,
          datos,
        )

        const diferencia = Number(resultado?.caja?.diferencia)
        if (Number.isFinite(diferencia) && diferencia !== 0) {
          emitirAlertaSinBloquear({
            tipo: 'caja.diferencia',
            severidad: 'critical',
            titulo: 'Diferencia detectada al cerrar caja',
            mensaje: 'Una caja fue cerrada con diferencia entre el efectivo esperado y el contado.',
            contexto: {
              caja_id: resultado.caja.id,
              diferencia: resultado.caja.diferencia,
              usuario_cierre: resultado.caja.usuario_cierre,
            },
            claveDeduplicacion: `caja.diferencia:${resultado.caja.id}`,
          })
        }

        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async listarCajas(req, res) {
      try {
        const resultado = await servicios.listarCajas(
          req.autenticacion?.token,
          crearOpcionesListado(req.query),
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async obtenerCaja(req, res) {
      try {
        const cajaTurnoId = validarUuid(req.params.cajaId)
        const resultado = await servicios.obtenerCaja(
          req.autenticacion?.token,
          cajaTurnoId,
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async obtenerEstadoDevolucionVenta(req, res) {
      try {
        const ventaId = validarUuid(req.params.ventaId)
        const resultado = await servicios.obtenerEstadoDevolucionVenta(
          req.autenticacion?.token,
          ventaId,
        )
        return res.status(200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },

    async registrarDevolucionVenta(req, res) {
      try {
        const ventaId = validarUuid(req.params.ventaId)
        const claveIdempotencia = validarUuid(req.get('Idempotency-Key'))
        const { motivo } = crearDatosDevolucion(req.body)
        const resultado = await servicios.registrarDevolucionVenta(
          req.autenticacion?.token,
          ventaId,
          claveIdempotencia,
          motivo,
        )
        return res.status(resultado.cambio ? 201 : 200).json(resultado)
      } catch (error) {
        return responderError(res, error)
      }
    },
  })
}

export const validadoresCaja = Object.freeze({
  validarUuid,
  crearDatosApertura,
  crearDatosCierre,
  crearDatosDevolucion,
  crearOpcionesListado,
})

const controladoresCaja = crearControladoresCaja()

export const abrirCaja = controladoresCaja.abrirCaja
export const obtenerCajaActual = controladoresCaja.obtenerCajaActual
export const obtenerResumenCajaActual =
  controladoresCaja.obtenerResumenCajaActual
export const cerrarCaja = controladoresCaja.cerrarCaja
export const listarCajas = controladoresCaja.listarCajas
export const obtenerCaja = controladoresCaja.obtenerCaja
export const obtenerEstadoDevolucionVenta =
  controladoresCaja.obtenerEstadoDevolucionVenta
export const registrarDevolucionVenta =
  controladoresCaja.registrarDevolucionVenta
