import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import IconoInterfaz from '../components/IconoInterfaz'
import {
  abrirCaja,
  cerrarCaja,
  crearClaveIdempotencia,
  listarCajas,
  obtenerCaja,
  obtenerCajaActual,
  obtenerResumenCajaActual,
} from '../services/caja'
import './Caja.css'

const LIMITE_HISTORIAL = 10
const PREFIJO_APERTURA_PENDIENTE = 'efarm:caja:apertura-pendiente'
const PREFIJO_CIERRE_PENDIENTE = 'efarm:caja:cierre-pendiente'
const PATRON_MONTO = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FILTROS_INICIALES = {
  fecha_desde: '',
  fecha_hasta: '',
  estado: '',
  usuario_id: '',
}

const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_HISTORIAL,
  total: 0,
  total_paginas: 0,
}

function crearClaveAlmacenamiento(prefijo, usuarioId) {
  return PATRON_UUID.test(usuarioId ?? '') ? `${prefijo}:${usuarioId}` : null
}

function leerOperacionPendiente(clave, validar) {
  if (!clave) return null

  try {
    const valor = window.sessionStorage.getItem(clave)
    if (!valor) return null

    const operacion = JSON.parse(valor)
    if (!validar(operacion)) {
      window.sessionStorage.removeItem(clave)
      return null
    }

    return operacion
  } catch {
    try {
      window.sessionStorage.removeItem(clave)
    } catch {
      // La operación se descarta igualmente si el almacenamiento no responde.
    }
    return null
  }
}

function guardarOperacionPendiente(clave, operacion) {
  if (!clave) return

  try {
    if (operacion) {
      window.sessionStorage.setItem(clave, JSON.stringify(operacion))
    } else {
      window.sessionStorage.removeItem(clave)
    }
  } catch {
    // La operación sigue protegida en memoria aunque sessionStorage no exista.
  }
}

function eliminarClavesGlobalesLegadas() {
  try {
    window.sessionStorage.removeItem(PREFIJO_APERTURA_PENDIENTE)
    window.sessionStorage.removeItem(PREFIJO_CIERRE_PENDIENTE)
  } catch {
    // Las claves antiguas se ignoran si sessionStorage no está disponible.
  }
}

function eliminarOperacionesDeOtrosUsuarios(usuarioId) {
  try {
    const clavesPropias = new Set([
      crearClaveAlmacenamiento(PREFIJO_APERTURA_PENDIENTE, usuarioId),
      crearClaveAlmacenamiento(PREFIJO_CIERRE_PENDIENTE, usuarioId),
    ])
    const clavesParaEliminar = []

    for (let indice = 0; indice < window.sessionStorage.length; indice += 1) {
      const clave = window.sessionStorage.key(indice)
      const esOperacionCaja =
        clave?.startsWith(`${PREFIJO_APERTURA_PENDIENTE}:`) ||
        clave?.startsWith(`${PREFIJO_CIERRE_PENDIENTE}:`)
      if (esOperacionCaja && !clavesPropias.has(clave)) {
        clavesParaEliminar.push(clave)
      }
    }

    clavesParaEliminar.forEach((clave) =>
      window.sessionStorage.removeItem(clave),
    )
  } catch {
    // El aislamiento en memoria se conserva aunque sessionStorage no responda.
  }
}

function normalizarMonto(valor) {
  return String(valor ?? '').trim()
}

function montoValido(valor) {
  const monto = normalizarMonto(valor)
  if (!PATRON_MONTO.test(monto)) return false
  return convertirCentavos(monto) <= 99999999999999n
}

function esOperacionAperturaValida(operacion, usuarioId) {
  return (
    operacion?.usuarioId === usuarioId &&
    PATRON_UUID.test(operacion?.clave ?? '') &&
    montoValido(operacion?.fondoInicial)
  )
}

function esOperacionCierreValida(operacion, usuarioId) {
  return (
    operacion?.usuarioId === usuarioId &&
    PATRON_UUID.test(operacion?.clave ?? '') &&
    PATRON_UUID.test(operacion?.cajaId ?? '') &&
    montoValido(operacion?.efectivoContado) &&
    typeof operacion?.observaciones === 'string' &&
    operacion.observaciones.length <= 1000
  )
}

function convertirCentavos(valor) {
  const texto = normalizarMonto(valor)
  if (!/^-?\d+(?:\.\d+)?$/.test(texto)) return null
  const negativo = texto.startsWith('-')
  const absoluto = negativo ? texto.slice(1) : texto
  const [entero, decimal = ''] = absoluto.split('.')
  const centavos = BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0').slice(0, 2))
  return negativo ? -centavos : centavos
}

function formatearCentavos(centavos) {
  const negativo = centavos < 0n
  const absoluto = negativo ? -centavos : centavos
  const entero = (absoluto / 100n).toString()
  const decimal = (absoluto % 100n).toString().padStart(2, '0')
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negativo ? '-' : ''}Q ${agrupado}.${decimal}`
}

function formatearMoneda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const centavos = convertirCentavos(valor)
  return centavos === null ? '—' : formatearCentavos(centavos)
}

function calcularDiferencia(contado, esperado) {
  const centavosContado = convertirCentavos(contado)
  const centavosEsperado = convertirCentavos(esperado)
  if (centavosContado === null || centavosEsperado === null) return null
  return formatearCentavos(centavosContado - centavosEsperado)
}

function formatearFechaHora(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return String(valor)
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fecha)
}

function obtenerMensajeError(error, mensajePredeterminado) {
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  if (error?.status === 403) {
    return 'No tienes permiso para realizar esta acción.'
  }
  return error?.message || mensajePredeterminado
}

function TarjetaCaja({ icono, etiqueta, valor, detalle, tono = 'petroleo' }) {
  return (
    <article className={`tarjeta-caja tarjeta-caja-${tono}`}>
      <div className="cabecera-tarjeta-caja">
        <span aria-hidden="true">
          <IconoInterfaz nombre={icono} />
        </span>
        <small>{etiqueta}</small>
      </div>
      <strong>{valor}</strong>
      {detalle && <p>{detalle}</p>}
    </article>
  )
}

function Caja({ permisos = [], usuarioActualId, alRefrescarAutorizacion }) {
  const puedeOperar = permisos.includes('caja.operar')
  const puedeVer = permisos.includes('caja.ver')
  const puedeSupervisar = permisos.includes('caja.supervisar')
  const claveAperturaAlmacenamiento = useMemo(
    () => crearClaveAlmacenamiento(PREFIJO_APERTURA_PENDIENTE, usuarioActualId),
    [usuarioActualId],
  )
  const claveCierreAlmacenamiento = useMemo(
    () => crearClaveAlmacenamiento(PREFIJO_CIERRE_PENDIENTE, usuarioActualId),
    [usuarioActualId],
  )
  const [operacionesIniciales] = useState(() => {
    eliminarClavesGlobalesLegadas()
    eliminarOperacionesDeOtrosUsuarios(usuarioActualId)
    return {
      apertura: leerOperacionPendiente(
        crearClaveAlmacenamiento(
          PREFIJO_APERTURA_PENDIENTE,
          usuarioActualId,
        ),
        (operacion) => esOperacionAperturaValida(operacion, usuarioActualId),
      ),
      cierre: leerOperacionPendiente(
        crearClaveAlmacenamiento(
          PREFIJO_CIERRE_PENDIENTE,
          usuarioActualId,
        ),
        (operacion) => esOperacionCierreValida(operacion, usuarioActualId),
      ),
    }
  })
  const [cajaActual, setCajaActual] = useState(null)
  const [resumenActual, setResumenActual] = useState(null)
  const [cargandoActual, setCargandoActual] = useState(true)
  const [errorActual, setErrorActual] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [refresco, setRefresco] = useState(0)
  const [operacionApertura, setOperacionApertura] = useState(
    operacionesIniciales.apertura,
  )
  const [fondoInicial, setFondoInicial] = useState(
    operacionesIniciales.apertura?.fondoInicial ?? '',
  )
  const [abriendo, setAbriendo] = useState(false)
  const [errorApertura, setErrorApertura] = useState('')
  const [operacionCierre, setOperacionCierre] = useState(
    operacionesIniciales.cierre,
  )
  const [dialogoCierre, setDialogoCierre] = useState(null)
  const [cargandoCierre, setCargandoCierre] = useState(false)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [errorCierre, setErrorCierre] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [resultadoCierre, setResultadoCierre] = useState(null)
  const [filtrosEdicion, setFiltrosEdicion] = useState(FILTROS_INICIALES)
  const [filtros, setFiltros] = useState(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [turnos, setTurnos] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [errorHistorial, setErrorHistorial] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState('')
  const controladorDetalleRef = useRef(null)
  const controladorCierreRef = useRef(null)
  const solicitudDetalleRef = useRef(0)
  const solicitudCierreRef = useRef(0)
  const dialogoDetalleRef = useRef(null)
  const dialogoCierreRef = useRef(null)
  const activadorDetalleRef = useRef(null)
  const activadorCierreRef = useRef(null)
  const puedeConsultar = puedeOperar || puedeVer

  const actualizarOperacionApertura = useCallback((operacion) => {
    const operacionPropia = operacion
      ? { ...operacion, usuarioId: usuarioActualId }
      : null
    setOperacionApertura(operacionPropia)
    guardarOperacionPendiente(
      claveAperturaAlmacenamiento,
      operacionPropia,
    )
  }, [claveAperturaAlmacenamiento, usuarioActualId])

  const actualizarOperacionCierre = useCallback((operacion) => {
    const operacionPropia = operacion
      ? { ...operacion, usuarioId: usuarioActualId }
      : null
    setOperacionCierre(operacionPropia)
    guardarOperacionPendiente(claveCierreAlmacenamiento, operacionPropia)
  }, [claveCierreAlmacenamiento, usuarioActualId])

  const aperturaPendiente =
    operacionApertura?.usuarioId === usuarioActualId
      ? operacionApertura
      : null
  const cierrePendiente =
    operacionCierre?.usuarioId === usuarioActualId ? operacionCierre : null

  const restaurarFoco = useCallback((elemento) => {
    window.requestAnimationFrame(() => {
      if (elemento?.isConnected) elemento.focus()
    })
  }, [])

  const cerrarDetalle = useCallback(() => {
    solicitudDetalleRef.current += 1
    controladorDetalleRef.current?.abort()
    controladorDetalleRef.current = null
    setDetalle(null)
    setErrorDetalle('')
    setCargandoDetalle(false)
    restaurarFoco(activadorDetalleRef.current)
    activadorDetalleRef.current = null
  }, [restaurarFoco])

  const cancelarDialogoCierre = useCallback(() => {
    solicitudCierreRef.current += 1
    controladorCierreRef.current?.abort()
    controladorCierreRef.current = null
    setDialogoCierre(null)
    setCargandoCierre(false)
    setConfirmandoCierre(false)
    setErrorCierre('')
    setEfectivoContado('')
    setObservaciones('')
    restaurarFoco(activadorCierreRef.current)
    activadorCierreRef.current = null
  }, [
    restaurarFoco,
    setConfirmandoCierre,
    setEfectivoContado,
    setObservaciones,
  ])

  useEffect(
    () => () => {
      solicitudDetalleRef.current += 1
      solicitudCierreRef.current += 1
      controladorDetalleRef.current?.abort()
      controladorCierreRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!puedeConsultar) return undefined
    const controlador = new AbortController()
    let vigente = true

    const cargar = async () => {
      setCargandoActual(true)
      setErrorActual('')

      try {
        const actual = await obtenerCajaActual({ signal: controlador.signal })
        let resumen = actual.resumen

        if (actual.caja) {
          const consultaResumen = await obtenerResumenCajaActual({
            signal: controlador.signal,
          })
          if (consultaResumen.caja_id === actual.caja.id) {
            resumen = consultaResumen.resumen
          }
        }

        if (!vigente) return
        setCajaActual(actual.caja)
        setResumenActual(resumen)

        if (actual.caja && aperturaPendiente) {
          actualizarOperacionApertura(null)
          setErrorApertura('')
        }
      } catch (error) {
        if (!vigente || error?.name === 'AbortError') return
        setErrorActual(
          obtenerMensajeError(error, 'No fue posible consultar la caja actual.'),
        )
        if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
      } finally {
        if (vigente) setCargandoActual(false)
      }
    }

    cargar()
    return () => {
      vigente = false
      controlador.abort()
    }
  }, [
    alRefrescarAutorizacion,
    actualizarOperacionApertura,
    aperturaPendiente,
    puedeConsultar,
    refresco,
    usuarioActualId,
  ])

  useEffect(() => {
    if (!puedeConsultar) return undefined
    const controlador = new AbortController()
    let vigente = true

    const cargar = async () => {
      setCargandoHistorial(true)
      setErrorHistorial('')

      try {
        const resultado = await listarCajas(
          {
            ...filtros,
            pagina,
            limite: LIMITE_HISTORIAL,
          },
          { signal: controlador.signal },
        )
        if (!vigente) return
        setTurnos(resultado.cajas)
        setPaginacion(resultado.paginacion)
      } catch (error) {
        if (!vigente || error?.name === 'AbortError') return
        setTurnos([])
        setPaginacion(PAGINACION_INICIAL)
        setErrorHistorial(
          obtenerMensajeError(error, 'No fue posible consultar el historial.'),
        )
        if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
      } finally {
        if (vigente) setCargandoHistorial(false)
      }
    }

    cargar()
    return () => {
      vigente = false
      controlador.abort()
    }
  }, [
    alRefrescarAutorizacion,
    filtros,
    pagina,
    puedeConsultar,
    refresco,
    usuarioActualId,
  ])

  useEffect(() => {
    if (!cierrePendiente || !puedeConsultar) return undefined
    let vigente = true

    obtenerCaja(cierrePendiente.cajaId)
      .then((resultado) => {
        if (!vigente || resultado.caja.estado !== 'cerrada') return
        setResultadoCierre({
          id: resultado.caja.id,
          estado: resultado.caja.estado,
          efectivo_esperado: resultado.caja.efectivo_esperado_cierre,
          efectivo_contado: resultado.caja.efectivo_contado,
          diferencia: resultado.caja.diferencia,
          fecha_cierre: resultado.caja.fecha_cierre,
        })
        actualizarOperacionCierre(null)
        setRefresco((valor) => valor + 1)
      })
      .catch(() => {
        // Se conserva la clave para que el usuario pueda reintentar sin duplicar.
      })

    return () => {
      vigente = false
    }
  }, [
    actualizarOperacionCierre,
    cierrePendiente,
    puedeConsultar,
  ])

  useEffect(() => {
    const detalleVisible = Boolean(detalle || cargandoDetalle || errorDetalle)
    if (!dialogoCierre && !detalleVisible) {
      return undefined
    }

    const dialogo = dialogoCierre
      ? dialogoCierreRef.current
      : dialogoDetalleRef.current
    if (!dialogo) return undefined

    const elementosEnfocables = () => [
      ...dialogo.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ]

    const enfocarDialogo = window.requestAnimationFrame(() => {
      const elementos = elementosEnfocables()
      ;(elementos[0] ?? dialogo).focus()
    })

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape') {
        if (dialogoCierre && cerrando) return
        evento.preventDefault()
        if (dialogoCierre) cancelarDialogoCierre()
        else cerrarDetalle()
        return
      }

      if (evento.key !== 'Tab') return
      const elementos = elementosEnfocables()
      if (elementos.length === 0) {
        evento.preventDefault()
        dialogo.focus()
        return
      }

      const primero = elementos[0]
      const ultimo = elementos[elementos.length - 1]
      if (!dialogo.contains(document.activeElement)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    window.addEventListener('keydown', manejarTeclado)
    return () => {
      window.cancelAnimationFrame(enfocarDialogo)
      window.removeEventListener('keydown', manejarTeclado)
    }
  }, [
    cancelarDialogoCierre,
    cargandoDetalle,
    cerrando,
    cerrarDetalle,
    detalle,
    dialogoCierre,
    errorDetalle,
  ])

  const abrirTurno = async (evento) => {
    evento.preventDefault()
    if (abriendo) return

    const monto = normalizarMonto(fondoInicial)
    if (!montoValido(monto)) {
      setErrorApertura('Ingresa un fondo inicial válido, con máximo dos decimales.')
      return
    }

    if (aperturaPendiente && aperturaPendiente.fondoInicial !== monto) {
      setErrorApertura(
        'Hay un intento pendiente. Reintenta con el mismo fondo inicial.',
      )
      return
    }

    const operacion =
      aperturaPendiente ?? {
        clave: crearClaveIdempotencia(),
        fondoInicial: monto,
      }
    actualizarOperacionApertura(operacion)
    setAbriendo(true)
    setErrorApertura('')
    setMensaje(null)

    try {
      const resultado = await abrirCaja(monto, operacion.clave)
      actualizarOperacionApertura(null)
      setFondoInicial('')
      setMensaje({
        tipo: 'exito',
        texto: resultado.cambio
          ? 'La caja se abrió correctamente.'
          : 'La apertura ya había sido procesada.',
      })
      setRefresco((valor) => valor + 1)
    } catch (error) {
      if (!error?.resultadoIncierto) actualizarOperacionApertura(null)
      setErrorApertura(
        error?.resultadoIncierto
          ? 'No se pudo confirmar el resultado. Conservamos la misma clave y el mismo importe para un reintento seguro.'
          : obtenerMensajeError(error, 'No fue posible abrir la caja.'),
      )
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
    } finally {
      setAbriendo(false)
    }
  }

  const mostrarDetalle = async (cajaId, elementoActivador) => {
    solicitudDetalleRef.current += 1
    const solicitudId = solicitudDetalleRef.current
    controladorDetalleRef.current?.abort()
    const controlador = new AbortController()
    controladorDetalleRef.current = controlador
    activadorDetalleRef.current = elementoActivador ?? document.activeElement
    setDetalle(null)
    setErrorDetalle('')
    setCargandoDetalle(true)

    try {
      const resultado = await obtenerCaja(cajaId, {
        signal: controlador.signal,
      })
      if (
        controlador.signal.aborted ||
        solicitudDetalleRef.current !== solicitudId
      ) {
        return
      }
      setDetalle(resultado)
    } catch (error) {
      if (
        error?.name === 'AbortError' ||
        solicitudDetalleRef.current !== solicitudId
      ) {
        return
      }
      setErrorDetalle(
        obtenerMensajeError(error, 'No fue posible consultar el turno.'),
      )
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
    } finally {
      if (solicitudDetalleRef.current === solicitudId) {
        controladorDetalleRef.current = null
        setCargandoDetalle(false)
      }
    }
  }

  const prepararCierre = async (turno, elementoActivador = null) => {
    if (cierrePendiente && cierrePendiente.cajaId !== turno.id) {
      setMensaje({
        tipo: 'advertencia',
        texto: 'Hay un cierre pendiente de confirmar. Reintenta ese cierre antes de iniciar otro.',
      })
      return
    }

    solicitudCierreRef.current += 1
    const solicitudId = solicitudCierreRef.current
    controladorCierreRef.current?.abort()
    const controlador = new AbortController()
    controladorCierreRef.current = controlador
    if (elementoActivador) activadorCierreRef.current = elementoActivador
    setDialogoCierre({ turno, resumen: null })
    setErrorCierre('')
    setConfirmandoCierre(false)
    setCargandoCierre(true)
    setEfectivoContado(
      cierrePendiente?.cajaId === turno.id
        ? cierrePendiente.efectivoContado
        : '',
    )
    setObservaciones(
      cierrePendiente?.cajaId === turno.id
        ? cierrePendiente.observaciones
        : '',
    )

    try {
      const resultado = await obtenerCaja(turno.id, {
        signal: controlador.signal,
      })
      if (
        controlador.signal.aborted ||
        solicitudCierreRef.current !== solicitudId
      ) {
        return
      }

      if (resultado.caja.id !== turno.id) {
        throw new Error('El servidor devolvió una caja diferente a la solicitada.')
      }

      if (resultado.caja.estado !== 'abierta') {
        setDialogoCierre({ turno: resultado.caja, resumen: null })
        setErrorCierre('La caja ya fue cerrada y no puede volver a procesarse.')
        setRefresco((valor) => valor + 1)
        return
      }

      if (!montoValido(resultado.resumen?.efectivo_esperado)) {
        throw new Error('El servidor no devolvió un resumen de caja válido.')
      }

      setDialogoCierre({ turno: resultado.caja, resumen: resultado.resumen })
    } catch (error) {
      if (
        error?.name === 'AbortError' ||
        solicitudCierreRef.current !== solicitudId
      ) {
        return
      }
      setErrorCierre(
        obtenerMensajeError(error, 'No fue posible preparar el cierre.'),
      )
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
    } finally {
      if (solicitudCierreRef.current === solicitudId) {
        controladorCierreRef.current = null
        setCargandoCierre(false)
      }
    }
  }

  const solicitarConfirmacionCierre = (evento) => {
    evento.preventDefault()
    if (!montoValido(dialogoCierre?.resumen?.efectivo_esperado)) {
      setErrorCierre(
        'No es posible cerrar la caja sin consultar primero su resumen real.',
      )
      return
    }
    if (!montoValido(efectivoContado)) {
      setErrorCierre('Ingresa un efectivo contado válido, con máximo dos decimales.')
      return
    }
    if (observaciones.trim().length > 1000) {
      setErrorCierre('Las observaciones no pueden superar 1000 caracteres.')
      return
    }
    setErrorCierre('')
    setConfirmandoCierre(true)
  }

  const confirmarCierre = async () => {
    if (cerrando || !dialogoCierre?.turno?.id) return
    if (!montoValido(dialogoCierre?.resumen?.efectivo_esperado)) {
      setConfirmandoCierre(false)
      setErrorCierre(
        'No es posible cerrar la caja sin consultar primero su resumen real.',
      )
      return
    }
    const monto = normalizarMonto(efectivoContado)
    const textoObservaciones = observaciones.trim().replace(/\s+/g, ' ')
    const operacion =
      cierrePendiente ?? {
        clave: crearClaveIdempotencia(),
        cajaId: dialogoCierre.turno.id,
        efectivoContado: monto,
        observaciones: textoObservaciones,
      }

    if (
      operacion.cajaId !== dialogoCierre.turno.id ||
      operacion.efectivoContado !== monto ||
      operacion.observaciones !== textoObservaciones
    ) {
      setErrorCierre('El reintento debe conservar exactamente los datos originales.')
      return
    }

    actualizarOperacionCierre(operacion)
    setCerrando(true)
    setErrorCierre('')

    try {
      const resultado = await cerrarCaja(
        operacion.cajaId,
        {
          efectivo_contado: operacion.efectivoContado,
          observaciones: operacion.observaciones || null,
        },
        operacion.clave,
      )
      actualizarOperacionCierre(null)
      setResultadoCierre(resultado.caja)
      cancelarDialogoCierre()
      setMensaje({
        tipo: 'exito',
        texto: resultado.cambio
          ? 'La caja se cerró correctamente.'
          : 'El cierre ya había sido procesado.',
      })
      setRefresco((valor) => valor + 1)
    } catch (error) {
      if (!error?.resultadoIncierto) actualizarOperacionCierre(null)
      setConfirmandoCierre(false)
      if (
        error?.status === 409 &&
        error?.message?.toLowerCase().includes('ya fue cerrada')
      ) {
        setDialogoCierre((actual) =>
          actual ? { ...actual, resumen: null } : actual,
        )
        setErrorCierre('La caja ya fue cerrada por otra operación.')
        setRefresco((valor) => valor + 1)
        return
      }
      setErrorCierre(
        error?.resultadoIncierto
          ? 'No se pudo confirmar el resultado. Los datos y la clave se conservaron para reintentar el mismo cierre.'
          : obtenerMensajeError(error, 'No fue posible cerrar la caja.'),
      )
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion?.()
    } finally {
      setCerrando(false)
    }
  }

  const aplicarFiltros = (evento) => {
    evento.preventDefault()
    if (
      filtrosEdicion.fecha_desde &&
      filtrosEdicion.fecha_hasta &&
      filtrosEdicion.fecha_desde > filtrosEdicion.fecha_hasta
    ) {
      setErrorHistorial('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }
    if (
      filtrosEdicion.usuario_id &&
      !PATRON_UUID.test(filtrosEdicion.usuario_id.trim())
    ) {
      setErrorHistorial('El ID del cajero debe ser un UUID válido.')
      return
    }
    setPagina(1)
    setFiltros({
      ...filtrosEdicion,
      usuario_id: puedeVer ? filtrosEdicion.usuario_id.trim() : '',
    })
  }

  const limpiarFiltros = () => {
    setFiltrosEdicion(FILTROS_INICIALES)
    setFiltros(FILTROS_INICIALES)
    setPagina(1)
  }

  const diferenciaPrevia = useMemo(
    () =>
      calcularDiferencia(
        efectivoContado,
        dialogoCierre?.resumen?.efectivo_esperado,
      ),
    [dialogoCierre?.resumen?.efectivo_esperado, efectivoContado],
  )
  const resumenCierreDisponible = montoValido(
    dialogoCierre?.resumen?.efectivo_esperado,
  )

  const puedeCerrarTurno = (turno) => {
    if (turno.estado !== 'abierta') return false
    if (puedeSupervisar) return true
    const responsableId =
      typeof turno.usuario_responsable === 'string'
        ? turno.usuario_responsable
        : turno.usuario_responsable?.id
    return puedeOperar && responsableId === usuarioActualId
  }

  if (!puedeConsultar) {
    return (
      <section className="pagina-caja">
        <header className="encabezado-caja"><h1>Caja</h1></header>
        <p className="estado-caja estado-error-caja" role="alert">
          No tienes permiso para consultar este módulo.
        </p>
      </section>
    )
  }

  return (
    <section className="pagina-caja">
      <header className="encabezado-caja">
        <div>
          <h1>Caja</h1>
          {cajaActual && (
            <EstadoEtiqueta tono="positivo">
              Turno abierto
            </EstadoEtiqueta>
          )}
        </div>
        <button
          className="boton-secundario-caja"
          type="button"
          onClick={() => setRefresco((valor) => valor + 1)}
          disabled={cargandoActual || cargandoHistorial}
        >
          Actualizar
        </button>
      </header>

      {mensaje && (
        <p className={`mensaje-caja mensaje-${mensaje.tipo}-caja`} role="status">
          {mensaje.texto}
        </p>
      )}

      {resultadoCierre && (
        <section className="resultado-cierre-caja" aria-labelledby="resultado-cierre">
          <div>
            <p className="etiqueta-caja">Cierre registrado</p>
            <h2 id="resultado-cierre">Resultado del arqueo</h2>
            <small>{formatearFechaHora(resultadoCierre.fecha_cierre)}</small>
          </div>
          <dl>
            <div><dt>Efectivo esperado</dt><dd>{formatearMoneda(resultadoCierre.efectivo_esperado)}</dd></div>
            <div><dt>Efectivo contado</dt><dd>{formatearMoneda(resultadoCierre.efectivo_contado)}</dd></div>
            <div><dt>Diferencia</dt><dd>{formatearMoneda(resultadoCierre.diferencia)}</dd></div>
          </dl>
          <button className="boton-texto-caja" type="button" onClick={() => setResultadoCierre(null)}>Ocultar resultado</button>
        </section>
      )}

      {cargandoActual ? (
        <p className="estado-caja" aria-live="polite">Consultando caja actual...</p>
      ) : errorActual ? (
        <p className="estado-caja estado-error-caja" role="alert">{errorActual}</p>
      ) : cajaActual ? (
        <section className="seccion-caja-actual" aria-labelledby="titulo-caja-actual">
          <div className="titulo-seccion-caja">
            <div>
              <p className="etiqueta-caja">Caja actual</p>
              <h2 id="titulo-caja-actual">Turno en curso</h2>
              <small>Abierto el {formatearFechaHora(cajaActual.fecha_apertura)}</small>
            </div>
            {puedeOperar && (
              <button className="boton-peligro-caja" type="button" onClick={(evento) => prepararCierre({ ...cajaActual, usuario_responsable: { id: cajaActual.usuario_responsable } }, evento.currentTarget)}>Cerrar caja</button>
            )}
          </div>
          <div className="resumen-caja">
            <TarjetaCaja icono="caja" etiqueta="Fondo inicial" valor={formatearMoneda(resumenActual?.fondo_inicial ?? cajaActual.fondo_inicial)} detalle="Efectivo registrado al abrir" />
            <TarjetaCaja icono="ventas" etiqueta="Ventas en efectivo" valor={formatearMoneda(resumenActual?.ventas_efectivo)} detalle={`${resumenActual?.cantidad_ventas ?? 0} ventas registradas`} tono="verde" />
            <TarjetaCaja icono="reportes" etiqueta="Devoluciones" valor={formatearMoneda(resumenActual?.devoluciones_efectivo)} detalle={`${resumenActual?.cantidad_devoluciones ?? 0} movimientos`} tono="oliva" />
            <TarjetaCaja icono="disponible" etiqueta="Efectivo esperado" valor={formatearMoneda(resumenActual?.efectivo_esperado)} detalle="Fondo inicial más movimiento neto" tono="dorado" />
          </div>
        </section>
      ) : puedeOperar ? (
        <section className="apertura-caja" aria-labelledby="titulo-apertura-caja">
          <div className="estado-vacio-caja">
            <span aria-hidden="true"><IconoInterfaz nombre="caja" /></span>
            <div>
              <p className="etiqueta-caja">Caja actual</p>
              <h2 id="titulo-apertura-caja">No tienes un turno abierto</h2>
              <p>Registra el fondo inicial para comenzar tu turno.</p>
            </div>
          </div>
          <form className="formulario-apertura-caja" onSubmit={abrirTurno}>
            <label htmlFor="fondo-inicial-caja">Fondo inicial</label>
            <div className="control-moneda-caja">
              <span>Q</span>
              <input
                id="fondo-inicial-caja"
                type="text"
                inputMode="decimal"
                value={fondoInicial}
                onChange={(evento) => setFondoInicial(evento.target.value)}
                placeholder="0.00"
                maxLength={15}
                disabled={abriendo || Boolean(aperturaPendiente)}
                required
              />
            </div>
            {errorApertura && <p className="error-formulario-caja" role="alert">{errorApertura}</p>}
            {aperturaPendiente && !abriendo && (
              <p className="aviso-reintento-caja">Reintento protegido: se conservarán la clave y el importe originales.</p>
            )}
            <button className="boton-primario-caja" type="submit" disabled={abriendo}>
              {abriendo ? 'Abriendo caja...' : aperturaPendiente ? 'Reintentar apertura' : 'Abrir caja'}
            </button>
          </form>
        </section>
      ) : (
        <section className="estado-vacio-caja estado-vacio-solo-lectura">
          <span aria-hidden="true"><IconoInterfaz nombre="caja" /></span>
          <div><h2>No tienes un turno abierto</h2><p>Puedes consultar los turnos disponibles en el historial.</p></div>
        </section>
      )}

      <section className="historial-caja" aria-labelledby="titulo-historial-caja">
        <div className="titulo-seccion-caja titulo-historial-caja">
          <div>
            <h2 id="titulo-historial-caja">{puedeVer ? 'Historial de cajas' : 'Mis turnos'}</h2>
            <small>{paginacion.total} turnos encontrados</small>
          </div>
        </div>
        <form className="filtros-caja" onSubmit={aplicarFiltros}>
          <label><span>Desde</span><input type="date" value={filtrosEdicion.fecha_desde} onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, fecha_desde: evento.target.value }))} /></label>
          <label><span>Hasta</span><input type="date" value={filtrosEdicion.fecha_hasta} onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, fecha_hasta: evento.target.value }))} /></label>
          <label><span>Estado</span><select value={filtrosEdicion.estado} onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, estado: evento.target.value }))}><option value="">Todos</option><option value="abierta">Abierta</option><option value="cerrada">Cerrada</option></select></label>
          {puedeVer && (
            <label className="filtro-usuario-caja"><span>ID del cajero</span><input value={filtrosEdicion.usuario_id} onChange={(evento) => setFiltrosEdicion((actual) => ({ ...actual, usuario_id: evento.target.value }))} placeholder="UUID opcional" /></label>
          )}
          <div className="acciones-filtros-caja"><button className="boton-secundario-caja" type="button" onClick={limpiarFiltros}>Limpiar</button><button className="boton-primario-caja" type="submit">Aplicar filtros</button></div>
        </form>

        {cargandoHistorial ? (
          <p className="estado-caja" aria-live="polite">Cargando historial...</p>
        ) : errorHistorial ? (
          <p className="estado-caja estado-error-caja" role="alert">{errorHistorial}</p>
        ) : turnos.length === 0 ? (
          <p className="estado-caja">No se encontraron turnos de caja.</p>
        ) : (
          <div className="desplazamiento-tabla-caja">
            <table className="tabla-caja">
              <thead><tr><th scope="col">Responsable</th><th scope="col">Apertura</th><th scope="col">Fondo inicial</th><th scope="col">Ventas</th><th scope="col">Esperado</th><th scope="col">Estado</th><th scope="col">Cierre / diferencia</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {turnos.map((turno) => (
                  <tr key={turno.id}>
                    <td data-label="Responsable"><strong>{turno.usuario_responsable?.nombre_completo ?? '—'}</strong><small>{turno.usuario_responsable?.id}</small></td>
                    <td data-label="Apertura">{formatearFechaHora(turno.fecha_apertura)}</td>
                    <td data-label="Fondo inicial">{formatearMoneda(turno.fondo_inicial)}</td>
                    <td data-label="Ventas"><strong>{formatearMoneda(turno.ventas_efectivo)}</strong><small>Devoluciones: {formatearMoneda(turno.devoluciones_efectivo)}</small></td>
                    <td data-label="Esperado"><strong>{formatearMoneda(turno.efectivo_esperado)}</strong></td>
                    <td data-label="Estado"><EstadoEtiqueta tono={turno.estado === 'abierta' ? 'positivo' : 'neutro'}>{turno.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</EstadoEtiqueta></td>
                    <td data-label="Cierre / diferencia"><strong>{formatearFechaHora(turno.fecha_cierre)}</strong>{turno.estado === 'cerrada' && <small>Diferencia: {formatearMoneda(turno.diferencia)}</small>}</td>
                    <td data-label="Acciones"><div className="acciones-fila-caja"><button className="boton-secundario-caja" type="button" onClick={(evento) => mostrarDetalle(turno.id, evento.currentTarget)}>Ver detalle</button>{puedeCerrarTurno(turno) && <button className="boton-peligro-texto-caja" type="button" onClick={(evento) => prepararCierre(turno, evento.currentTarget)}>Cerrar</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!cargandoHistorial && !errorHistorial && paginacion.total_paginas > 0 && (
          <nav className="paginacion-caja" aria-label="Paginación de cajas"><button className="boton-secundario-caja" type="button" disabled={pagina <= 1} onClick={() => setPagina((valor) => Math.max(1, valor - 1))}>Anterior</button><span>Página {paginacion.pagina} de {paginacion.total_paginas}</span><button className="boton-secundario-caja" type="button" disabled={pagina >= paginacion.total_paginas} onClick={() => setPagina((valor) => valor + 1)}>Siguiente</button></nav>
        )}
      </section>

      {(cargandoDetalle || errorDetalle || detalle) && (
        <div className="fondo-dialogo-caja" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) cerrarDetalle() }}>
          <section ref={dialogoDetalleRef} className="dialogo-caja" role="dialog" aria-modal="true" aria-labelledby="titulo-detalle-caja" tabIndex={-1}>
            <header><div><p className="etiqueta-caja">Turno de caja</p><h2 id="titulo-detalle-caja">Detalle del turno</h2></div><button type="button" aria-label="Cerrar detalle" onClick={cerrarDetalle}>×</button></header>
            <div className="contenido-dialogo-caja">
              {cargandoDetalle ? <p className="estado-caja">Consultando turno...</p> : errorDetalle ? <p className="estado-caja estado-error-caja" role="alert">{errorDetalle}</p> : detalle && <><dl className="datos-detalle-caja"><div><dt>Responsable</dt><dd>{detalle.caja.usuario_responsable?.nombre_completo}</dd></div><div><dt>Estado</dt><dd><EstadoEtiqueta tono={detalle.caja.estado === 'abierta' ? 'positivo' : 'neutro'}>{detalle.caja.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</EstadoEtiqueta></dd></div><div><dt>Apertura</dt><dd>{formatearFechaHora(detalle.caja.fecha_apertura)}</dd></div><div><dt>Cierre</dt><dd>{formatearFechaHora(detalle.caja.fecha_cierre)}</dd></div><div><dt>Fondo inicial</dt><dd>{formatearMoneda(detalle.caja.fondo_inicial)}</dd></div><div><dt>Efectivo esperado</dt><dd>{formatearMoneda(detalle.caja.efectivo_esperado_cierre ?? detalle.resumen.efectivo_esperado)}</dd></div><div><dt>Efectivo contado</dt><dd>{detalle.caja.efectivo_contado === null ? '—' : formatearMoneda(detalle.caja.efectivo_contado)}</dd></div><div><dt>Diferencia</dt><dd>{detalle.caja.diferencia === null ? '—' : formatearMoneda(detalle.caja.diferencia)}</dd></div></dl>{detalle.caja.observaciones && <div className="observaciones-detalle-caja"><strong>Observaciones</strong><p>{detalle.caja.observaciones}</p></div>}</>}
            </div>
            <footer><button className="boton-secundario-caja" type="button" onClick={cerrarDetalle}>Cerrar</button></footer>
          </section>
        </div>
      )}

      {dialogoCierre && (
        <div className="fondo-dialogo-caja" role="presentation">
          <section ref={dialogoCierreRef} className="dialogo-caja" role="dialog" aria-modal="true" aria-labelledby="titulo-cierre-caja" tabIndex={-1}>
            <header><div><p className="etiqueta-caja">Arqueo</p><h2 id="titulo-cierre-caja">Cerrar caja</h2></div><button type="button" aria-label="Cancelar cierre" disabled={cerrando} onClick={cancelarDialogoCierre}>×</button></header>
            <form onSubmit={solicitarConfirmacionCierre}>
              <div className="contenido-dialogo-caja">
                {cargandoCierre ? (
                  <p className="estado-caja">Consultando resumen...</p>
                ) : !resumenCierreDisponible ? (
                  <div className="error-preparacion-cierre-caja" role="alert">
                    <strong>No se puede preparar el cierre</strong>
                    <p>{errorCierre || 'No se recibió un resumen válido para esta caja.'}</p>
                    <div>
                      <button className="boton-secundario-caja" type="button" onClick={cancelarDialogoCierre}>Cancelar</button>
                      <button className="boton-primario-caja" type="button" onClick={() => prepararCierre(dialogoCierre.turno)}>Reintentar consulta</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="comparacion-cierre-caja"><div><span>Efectivo esperado</span><strong>{formatearMoneda(dialogoCierre.resumen.efectivo_esperado)}</strong></div><div><span>Efectivo contado</span><strong>{montoValido(efectivoContado) ? formatearMoneda(efectivoContado) : '—'}</strong></div><div><span>Diferencia prevista</span><strong>{diferenciaPrevia ?? '—'}</strong></div></div>
                    <label className="campo-caja" htmlFor="efectivo-contado-caja"><span>Efectivo contado *</span><div className="control-moneda-caja"><span>Q</span><input id="efectivo-contado-caja" type="text" inputMode="decimal" value={efectivoContado} onChange={(evento) => { setEfectivoContado(evento.target.value); setConfirmandoCierre(false) }} disabled={cerrando || Boolean(cierrePendiente)} placeholder="0.00" maxLength={15} required /></div></label>
                    <label className="campo-caja" htmlFor="observaciones-cierre-caja"><span>Observaciones</span><textarea id="observaciones-cierre-caja" value={observaciones} onChange={(evento) => { setObservaciones(evento.target.value); setConfirmandoCierre(false) }} disabled={cerrando || Boolean(cierrePendiente)} maxLength={1000} rows={3} placeholder="Opcional" /></label>
                    {errorCierre && <p className="error-formulario-caja" role="alert">{errorCierre}</p>}
                    {cierrePendiente && !cerrando && <p className="aviso-reintento-caja">Reintento protegido: se conservarán la clave y los datos originales.</p>}
                    {confirmandoCierre && <div className="confirmacion-cierre-caja" role="alert"><strong>¿Confirmas el cierre definitivo?</strong><p>El turno quedará cerrado y no podrá reabrirse.</p><div><button className="boton-secundario-caja" type="button" onClick={() => setConfirmandoCierre(false)} disabled={cerrando}>Volver</button><button className="boton-peligro-caja" type="button" onClick={confirmarCierre} disabled={cerrando}>{cerrando ? 'Cerrando...' : cierrePendiente ? 'Reintentar cierre' : 'Confirmar cierre'}</button></div></div>}
                  </>
                )}
              </div>
              {!cargandoCierre && resumenCierreDisponible && !confirmandoCierre && <footer><button className="boton-secundario-caja" type="button" onClick={cancelarDialogoCierre} disabled={cerrando}>Cancelar</button><button className="boton-peligro-caja" type="submit" disabled={cerrando}>Revisar cierre</button></footer>}
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default Caja
