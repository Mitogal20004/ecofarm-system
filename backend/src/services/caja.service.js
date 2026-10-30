import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

const esUuid = (valor) => typeof valor === 'string' && PATRON_UUID.test(valor)

const esDecimalSerializado = (valor) =>
  (typeof valor === 'number' && Number.isFinite(valor)) ||
  (typeof valor === 'string' && PATRON_DECIMAL.test(valor))

const esTextoNoVacio = (valor) =>
  typeof valor === 'string' && valor.trim().length > 0

const esFechaHora = (valor) =>
  typeof valor === 'string' && !Number.isNaN(Date.parse(valor))

export class ErrorServicioCaja extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioCaja'
    this.codigo = causa?.code ?? null
    this.detalle = causa?.message ?? null
  }
}

const crearErrorFormato = () =>
  new ErrorServicioCaja(
    'Supabase devolvió una respuesta de caja con formato inválido.',
  )

const validarPaginacion = (paginacion) =>
  esObjeto(paginacion) &&
  Number.isInteger(paginacion.pagina) &&
  Number.isInteger(paginacion.limite) &&
  Number.isInteger(paginacion.total) &&
  Number.isInteger(paginacion.total_paginas)

const validarDetalleEstadoDevolucion = (devolucion) =>
  esObjeto(devolucion) &&
  esUuid(devolucion.id) &&
  esUuid(devolucion.caja_turno_id) &&
  esDecimalSerializado(devolucion.importe_devuelto) &&
  esUuid(devolucion.usuario_id) &&
  esTextoNoVacio(devolucion.motivo) &&
  esFechaHora(devolucion.fecha_movimiento)

const validarDetalleRegistroDevolucion = (devolucion, ventaId) =>
  esObjeto(devolucion) &&
  esUuid(devolucion.id) &&
  devolucion.venta_id === ventaId &&
  esUuid(devolucion.caja_turno_id) &&
  esDecimalSerializado(devolucion.importe_devuelto) &&
  esDecimalSerializado(devolucion.variacion_efectivo) &&
  esUuid(devolucion.usuario_id) &&
  esTextoNoVacio(devolucion.motivo) &&
  esFechaHora(devolucion.fecha_movimiento)

const validarEstadoDevolucion = (data, ventaId) => {
  const sinDevolucion =
    data?.devolucion_registrada === false && data?.devolucion === null
  const conDevolucion =
    data?.devolucion_registrada === true &&
    validarDetalleEstadoDevolucion(data?.devolucion)

  return (
    esObjeto(data) &&
    data.venta_id === ventaId &&
    ['confirmada', 'anulada'].includes(data.estado_venta) &&
    esDecimalSerializado(data.total) &&
    typeof data.tiene_ingreso_caja === 'boolean' &&
    (sinDevolucion || conDevolucion)
  )
}

export function crearServicioCaja({
  crearCliente = crearClienteSupabaseAutenticado,
} = {}) {
  async function ejecutarRpc(token, nombre, parametros) {
    try {
      const supabaseAutenticado = crearCliente(token)
      const consulta = parametros
        ? supabaseAutenticado.rpc(nombre, parametros)
        : supabaseAutenticado.rpc(nombre)
      const { data, error } = await consulta

      if (error) {
        throw new ErrorServicioCaja(
          'No fue posible completar la operación de caja en Supabase.',
          error,
        )
      }

      return data
    } catch (error) {
      if (error instanceof ErrorServicioCaja) throw error

      throw new ErrorServicioCaja(
        'No fue posible completar la operación de caja en Supabase.',
        error,
      )
    }
  }

  async function abrirCaja(token, claveIdempotencia, fondoInicial) {
    const data = await ejecutarRpc(token, 'abrir_caja', {
      p_clave_idempotencia: claveIdempotencia,
      p_fondo_inicial: fondoInicial,
    })

    if (
      !esObjeto(data) ||
      typeof data.cambio !== 'boolean' ||
      !esObjeto(data.caja)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerCajaActual(token) {
    const data = await ejecutarRpc(token, 'obtener_caja_actual')
    const sinCaja = data?.caja === null && data?.resumen === null
    const conCaja = esObjeto(data?.caja) && esObjeto(data?.resumen)

    if (!esObjeto(data) || (!sinCaja && !conCaja)) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerResumenCajaActual(token) {
    const data = await ejecutarRpc(token, 'obtener_resumen_caja_actual')
    const sinCaja = data?.caja_id === null && data?.resumen === null
    const conCaja =
      typeof data?.caja_id === 'string' && esObjeto(data?.resumen)

    if (!esObjeto(data) || (!sinCaja && !conCaja)) {
      throw crearErrorFormato()
    }

    return data
  }

  async function cerrarCaja(
    token,
    cajaTurnoId,
    claveIdempotencia,
    datos,
  ) {
    const data = await ejecutarRpc(token, 'cerrar_caja', {
      p_caja_turno_id: cajaTurnoId,
      p_clave_idempotencia: claveIdempotencia,
      p_efectivo_contado: datos.efectivo_contado,
      p_observaciones: datos.observaciones,
    })

    if (
      !esObjeto(data) ||
      typeof data.cambio !== 'boolean' ||
      !esObjeto(data.caja)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function listarCajas(token, opciones = {}) {
    const parametros = {}

    if (opciones.pagina !== undefined) parametros.p_pagina = opciones.pagina
    if (opciones.limite !== undefined) parametros.p_limite = opciones.limite
    if (opciones.fechaDesde !== undefined) {
      parametros.p_fecha_desde = opciones.fechaDesde
    }
    if (opciones.fechaHasta !== undefined) {
      parametros.p_fecha_hasta = opciones.fechaHasta
    }
    if (opciones.usuarioId !== undefined) {
      parametros.p_usuario_id = opciones.usuarioId
    }
    if (opciones.estado !== undefined) parametros.p_estado = opciones.estado

    const data = await ejecutarRpc(token, 'listar_cajas', parametros)

    if (
      !esObjeto(data) ||
      !Array.isArray(data.cajas) ||
      !validarPaginacion(data.paginacion)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerCaja(token, cajaTurnoId) {
    const data = await ejecutarRpc(token, 'obtener_caja', {
      p_caja_turno_id: cajaTurnoId,
    })

    if (
      !esObjeto(data) ||
      !esObjeto(data.caja) ||
      !esObjeto(data.resumen)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  async function obtenerEstadoDevolucionVenta(token, ventaId) {
    const data = await ejecutarRpc(token, 'obtener_estado_devolucion_venta', {
      p_venta_id: ventaId,
    })

    if (!validarEstadoDevolucion(data, ventaId)) {
      throw crearErrorFormato()
    }

    return data
  }

  async function registrarDevolucionVenta(
    token,
    ventaId,
    claveIdempotencia,
    motivo,
  ) {
    const data = await ejecutarRpc(token, 'registrar_devolucion_venta', {
      p_venta_id: ventaId,
      p_clave_idempotencia: claveIdempotencia,
      p_motivo: motivo,
    })

    if (
      !esObjeto(data) ||
      typeof data.cambio !== 'boolean' ||
      !validarDetalleRegistroDevolucion(data.devolucion, ventaId)
    ) {
      throw crearErrorFormato()
    }

    return data
  }

  return Object.freeze({
    abrirCaja,
    obtenerCajaActual,
    obtenerResumenCajaActual,
    cerrarCaja,
    listarCajas,
    obtenerCaja,
    obtenerEstadoDevolucionVenta,
    registrarDevolucionVenta,
  })
}

const servicioCaja = crearServicioCaja()

export const abrirCaja = servicioCaja.abrirCaja
export const obtenerCajaActual = servicioCaja.obtenerCajaActual
export const obtenerResumenCajaActual =
  servicioCaja.obtenerResumenCajaActual
export const cerrarCaja = servicioCaja.cerrarCaja
export const listarCajas = servicioCaja.listarCajas
export const obtenerCaja = servicioCaja.obtenerCaja
export const obtenerEstadoDevolucionVenta =
  servicioCaja.obtenerEstadoDevolucionVenta
export const registrarDevolucionVenta =
  servicioCaja.registrarDevolucionVenta
