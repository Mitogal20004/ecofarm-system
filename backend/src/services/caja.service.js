import { crearClienteSupabaseAutenticado } from '../lib/supabase.js'

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)

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

  return Object.freeze({
    abrirCaja,
    obtenerCajaActual,
    obtenerResumenCajaActual,
    cerrarCaja,
    listarCajas,
    obtenerCaja,
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
