import { useCallback, useEffect, useRef, useState } from 'react'
import logoEfarm from '../assets/logo-efarm-brand.png'
import {
  anularVenta,
  generarReciboVenta,
  obtenerVenta,
} from '../services/ventas'
import {
  crearContextoDevolucion,
  crearClaveIdempotencia,
  obtenerEstadoDevolucionVenta,
} from '../services/caja'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'

const PREFIJO_DEVOLUCION_PENDIENTE = 'efarm:caja:devolucion-pendiente'
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const formatoFechaHora = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
})

const mostrarFecha = (valor) =>
  valor ? formatoFechaHora.format(new Date(valor)) : '—'

const crearClaveAlmacenamientoDevolucion = (usuarioId, ventaId) =>
  PATRON_UUID.test(usuarioId ?? '') && PATRON_UUID.test(ventaId ?? '')
    ? `${PREFIJO_DEVOLUCION_PENDIENTE}:${usuarioId}:${ventaId}`
    : null

const leerDevolucionPendiente = (clave, usuarioId, ventaId) => {
  if (!clave) return null

  try {
    const valor = window.sessionStorage.getItem(clave)
    if (!valor) return null
    const operacion = JSON.parse(valor)
    const valida =
      operacion?.usuarioId === usuarioId &&
      operacion?.ventaId === ventaId &&
      PATRON_UUID.test(operacion?.clave ?? '') &&
      typeof operacion?.motivo === 'string' &&
      operacion.motivo.length > 0 &&
      operacion.motivo.length <= 500

    if (valida) return operacion
    window.sessionStorage.removeItem(clave)
  } catch {
    try {
      window.sessionStorage.removeItem(clave)
    } catch {
      // El intento se descarta si el almacenamiento no está disponible.
    }
  }

  return null
}

const guardarDevolucionPendiente = (clave, operacion) => {
  if (!clave) return

  try {
    if (operacion) {
      window.sessionStorage.setItem(clave, JSON.stringify(operacion))
    } else {
      window.sessionStorage.removeItem(clave)
    }
  } catch {
    // El intento permanece protegido en memoria si sessionStorage falla.
  }
}

function DetalleVenta({
  ventaId,
  puedeAnular,
  puedeCrear,
  puedeConsultarDevolucion,
  puedeRegistrarDevolucion,
  usuarioActualId,
  documentoImpresionInicial = null,
  anularAlAbrir = false,
  alVolver,
  alActualizar,
  alRefrescarAutorizacion,
}) {
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mostrarAnulacion, setMostrarAnulacion] = useState(anularAlAbrir)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [documentoImpresion, setDocumentoImpresion] = useState(null)
  const claveAlmacenamientoDevolucion = crearClaveAlmacenamientoDevolucion(
    usuarioActualId,
    ventaId,
  )
  const [operacionDevolucion, setOperacionDevolucion] = useState(() =>
    leerDevolucionPendiente(
      crearClaveAlmacenamientoDevolucion(usuarioActualId, ventaId),
      usuarioActualId,
      ventaId,
    ),
  )
  const [estadoDevolucion, setEstadoDevolucion] = useState(null)
  const [cargandoDevolucion, setCargandoDevolucion] = useState(false)
  const [errorConsultaDevolucion, setErrorConsultaDevolucion] = useState('')
  const [versionDevolucion, setVersionDevolucion] = useState(0)
  const [mostrarDevolucion, setMostrarDevolucion] = useState(false)
  const [motivoDevolucion, setMotivoDevolucion] = useState(
    operacionDevolucion?.motivo ?? '',
  )
  const [registrandoDevolucion, setRegistrandoDevolucion] = useState(false)
  const [errorDevolucion, setErrorDevolucion] = useState('')
  const [mensajeDevolucion, setMensajeDevolucion] = useState('')
  const impresionSolicitadaRef = useRef(documentoImpresionInicial)
  const procesandoRef = useRef(false)
  const registrandoDevolucionRef = useRef(false)
  const dialogoDevolucionRef = useRef(null)
  const activadorDevolucionRef = useRef(null)
  const estadoDevolucionRef = useRef(null)
  const componenteActivoRef = useRef(false)
  const generacionDevolucionRef = useRef(0)
  const controladorDevolucionRef = useRef(null)

  const imprimirDocumento = useCallback((tipoDocumento) => {
    setDocumentoImpresion(tipoDocumento)
    window.setTimeout(() => {
      window.print()
      setDocumentoImpresion(null)
    }, 150)
  }, [])

  const cargarDetalle = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      setDetalle(await obtenerVenta(ventaId))
    } catch (errorCarga) {
      setError(errorCarga?.message || 'No fue posible cargar la venta.')
      if ([401, 403].includes(errorCarga?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, ventaId])

  useEffect(() => {
    const temporizador = window.setTimeout(cargarDetalle, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarDetalle])

  const actualizarOperacionDevolucion = useCallback(
    (operacion) => {
      const operacionPropia = operacion
        ? { ...operacion, usuarioId: usuarioActualId, ventaId }
        : null
      setOperacionDevolucion(operacionPropia)
      guardarDevolucionPendiente(
        claveAlmacenamientoDevolucion,
        operacionPropia,
      )
    },
    [claveAlmacenamientoDevolucion, usuarioActualId, ventaId],
  )

  const contextoDevolucionVigente = useCallback(
    (contexto) =>
      componenteActivoRef.current &&
      !contexto.controlador.signal.aborted &&
      generacionDevolucionRef.current === contexto.generacion &&
      contexto.usuarioId === usuarioActualId &&
      contexto.ventaId === ventaId,
    [usuarioActualId, ventaId],
  )

  useEffect(() => {
    componenteActivoRef.current = true

    return () => {
      componenteActivoRef.current = false
      generacionDevolucionRef.current += 1
      controladorDevolucionRef.current?.abort()
      controladorDevolucionRef.current = null
      registrandoDevolucionRef.current = false
    }
  }, [usuarioActualId, ventaId])

  const restaurarFocoDevolucion = useCallback(() => {
    window.requestAnimationFrame(() => {
      const activador = activadorDevolucionRef.current
      const destino =
        activador?.isConnected && !activador.disabled
          ? activador
          : estadoDevolucionRef.current
      destino?.focus({ preventScroll: true })
      activadorDevolucionRef.current = null
    })
  }, [])

  const cerrarDialogoDevolucion = useCallback(() => {
    if (registrandoDevolucionRef.current) return
    setMostrarDevolucion(false)
    setErrorDevolucion('')
    if (!operacionDevolucion) setMotivoDevolucion('')
    restaurarFocoDevolucion()
  }, [operacionDevolucion, restaurarFocoDevolucion])

  const abrirDialogoDevolucion = (elementoActivador) => {
    activadorDevolucionRef.current = elementoActivador
    setMotivoDevolucion(operacionDevolucion?.motivo ?? '')
    setErrorDevolucion('')
    setMostrarDevolucion(true)
  }

  useEffect(() => {
    if (!mostrarDevolucion) return undefined

    window.requestAnimationFrame(() => {
      const dialogo = dialogoDevolucionRef.current
      const campoMotivo = dialogo?.querySelector('textarea:not(:disabled)')
      const primerControl = dialogo?.querySelector(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
      )
      const destinoFoco = campoMotivo ?? primerControl ?? dialogo
      destinoFoco?.focus({ preventScroll: true })
    })

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape' && !registrandoDevolucionRef.current) {
        cerrarDialogoDevolucion()
        return
      }

      if (evento.key !== 'Tab') return

      const dialogo = dialogoDevolucionRef.current
      const controles = Array.from(
        dialogo?.querySelectorAll(
          'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((elemento) => !elemento.hasAttribute('hidden'))

      if (controles.length === 0) {
        evento.preventDefault()
        dialogo?.focus({ preventScroll: true })
        return
      }

      const primero = controles[0]
      const ultimo = controles[controles.length - 1]
      if (!dialogo?.contains(document.activeElement)) {
        evento.preventDefault()
        const destino = evento.shiftKey ? ultimo : primero
        destino.focus()
      } else if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', manejarTeclado)
    return () => document.removeEventListener('keydown', manejarTeclado)
  }, [cerrarDialogoDevolucion, mostrarDevolucion])

  useEffect(() => {
    if (
      !puedeConsultarDevolucion ||
      detalle?.venta?.estado !== 'anulada'
    ) {
      return undefined
    }

    const controlador = new AbortController()
    let vigente = true

    const cargarEstado = async () => {
      setCargandoDevolucion(true)
      setErrorConsultaDevolucion('')

      try {
        const resultado = await obtenerEstadoDevolucionVenta(ventaId, {
          signal: controlador.signal,
          usuarioEsperadoId: usuarioActualId,
        })
        if (vigente) {
          setEstadoDevolucion(resultado)
          if (resultado.devolucion_registrada && operacionDevolucion) {
            actualizarOperacionDevolucion(null)
            setMensajeDevolucion(
              'La devolución de efectivo ya está registrada.',
            )
            setMostrarDevolucion(false)
            restaurarFocoDevolucion()
          }
        }
      } catch (errorCarga) {
        if (!vigente || errorCarga?.name === 'AbortError') return
        setEstadoDevolucion(null)
        setErrorConsultaDevolucion(
          errorCarga?.message ||
            'No fue posible consultar el estado de la devolución.',
        )
        if ([401, 403].includes(errorCarga?.status)) {
          alRefrescarAutorizacion?.()
        }
      } finally {
        if (vigente) setCargandoDevolucion(false)
      }
    }

    cargarEstado()
    return () => {
      vigente = false
      controlador.abort()
    }
  }, [
    alRefrescarAutorizacion,
    actualizarOperacionDevolucion,
    detalle?.venta?.estado,
    operacionDevolucion,
    puedeConsultarDevolucion,
    restaurarFocoDevolucion,
    usuarioActualId,
    ventaId,
    versionDevolucion,
  ])

  useEffect(() => {
    const tipoDocumento = impresionSolicitadaRef.current
    if (!detalle || !tipoDocumento) return undefined
    if (tipoDocumento === 'recibo' && !detalle.recibo) return undefined

    impresionSolicitadaRef.current = false
    imprimirDocumento(tipoDocumento)
    return undefined
  }, [detalle, imprimirDocumento])

  const emitirRecibo = async () => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setProcesando(true)
    setError('')

    try {
      await generarReciboVenta(ventaId)
      await cargarDetalle()
      await alActualizar?.()
    } catch (errorEmision) {
      setError(errorEmision?.message || 'No fue posible emitir el recibo.')
      if ([401, 403].includes(errorEmision?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  const confirmarAnulacion = async (evento) => {
    evento.preventDefault()
    if (procesandoRef.current) return

    const motivoNormalizado = motivo.trim().replace(/\s+/g, ' ')
    if (!motivoNormalizado || motivoNormalizado.length > 400) {
      setError('Ingresa un motivo de anulación de hasta 400 caracteres.')
      return
    }
    if (
      !window.confirm(
        'Esta acción devolverá el producto al inventario y no puede revertirse. ¿Deseas anular la venta?',
      )
    ) {
      return
    }

    procesandoRef.current = true
    setProcesando(true)
    setError('')

    try {
      await anularVenta(ventaId, motivoNormalizado)
      setMostrarAnulacion(false)
      setMotivo('')
      await cargarDetalle()
      await alActualizar?.()
    } catch (errorAnulacion) {
      setError(errorAnulacion?.message || 'No fue posible anular la venta.')
      if ([401, 403].includes(errorAnulacion?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  const confirmarDevolucion = async (evento) => {
    evento.preventDefault()
    if (registrandoDevolucionRef.current) return

    const motivoNormalizado = motivoDevolucion.trim().replace(/\s+/g, ' ')
    if (!motivoNormalizado || motivoNormalizado.length > 500) {
      setErrorDevolucion(
        'Ingresa un motivo de devolución de hasta 500 caracteres.',
      )
      return
    }

    let operacion
    try {
      operacion =
        operacionDevolucion ?? {
          clave: crearClaveIdempotencia(),
          ventaId,
          motivo: motivoNormalizado,
        }
    } catch (errorClave) {
      setErrorDevolucion(
        errorClave?.message || 'No fue posible preparar una clave segura.',
      )
      return
    }

    if (
      operacion.ventaId !== ventaId ||
      operacion.motivo !== motivoNormalizado
    ) {
      setErrorDevolucion(
        'El reintento debe conservar exactamente el motivo original.',
      )
      return
    }

    registrandoDevolucionRef.current = true
    controladorDevolucionRef.current?.abort()
    const controlador = new AbortController()
    const contexto = {
      controlador,
      generacion: generacionDevolucionRef.current + 1,
      usuarioId: usuarioActualId,
      ventaId,
    }
    generacionDevolucionRef.current = contexto.generacion
    controladorDevolucionRef.current = controlador
    setRegistrandoDevolucion(true)
    setErrorDevolucion('')
    setMensajeDevolucion('')
    let seEnvioDevolucion = false

    try {
      const clienteDevolucion = await crearContextoDevolucion(
        contexto.usuarioId,
        { signal: controlador.signal },
      )
      if (!contextoDevolucionVigente(contexto)) return
      const estadoActual = await clienteDevolucion.obtenerEstado(ventaId, {
        signal: controlador.signal,
      })
      if (!contextoDevolucionVigente(contexto)) return
      setEstadoDevolucion(estadoActual)

      if (estadoActual.estado_venta !== 'anulada') {
        if (contextoDevolucionVigente(contexto)) {
          actualizarOperacionDevolucion(null)
        }
        throw new Error('La venta debe estar anulada antes de devolver efectivo.')
      }
      if (estadoActual.devolucion_registrada) {
        if (!contextoDevolucionVigente(contexto)) return
        actualizarOperacionDevolucion(null)
        setMensajeDevolucion('La devolución de efectivo ya está registrada.')
        setMostrarDevolucion(false)
        setMotivoDevolucion('')
        restaurarFocoDevolucion()
        return
      }
      if (!estadoActual.tiene_ingreso_caja) {
        if (contextoDevolucionVigente(contexto)) {
          actualizarOperacionDevolucion(null)
        }
        throw new Error(
          'La venta no tiene un ingreso de Caja válido para devolver.',
        )
      }

      const resultado = await clienteDevolucion.registrar(
        ventaId,
        operacion.motivo,
        operacion.clave,
        {
          signal: controlador.signal,
          antesDeEnviar: () => {
            if (!contextoDevolucionVigente(contexto)) {
              controlador.abort()
              return
            }
            actualizarOperacionDevolucion(operacion)
            seEnvioDevolucion = true
          },
        },
      )
      if (!contextoDevolucionVigente(contexto)) return
      actualizarOperacionDevolucion(null)
      setEstadoDevolucion({
        ...estadoActual,
        devolucion_registrada: true,
        devolucion: {
          id: resultado.devolucion.id,
          caja_turno_id: resultado.devolucion.caja_turno_id,
          importe_devuelto: resultado.devolucion.importe_devuelto,
          usuario_id: resultado.devolucion.usuario_id,
          motivo: resultado.devolucion.motivo,
          fecha_movimiento: resultado.devolucion.fecha_movimiento,
        },
      })
      setMensajeDevolucion(
        resultado.cambio
          ? 'La devolución de efectivo se registró correctamente.'
          : 'La devolución ya había sido procesada.',
      )
      setMostrarDevolucion(false)
      setMotivoDevolucion('')
      restaurarFocoDevolucion()
      await alActualizar?.()
    } catch (errorRegistro) {
      if (!contextoDevolucionVigente(contexto)) return
      const conservarReintentoPendiente =
        (!seEnvioDevolucion && Boolean(operacionDevolucion)) ||
        (seEnvioDevolucion && errorRegistro?.resultadoIncierto)
      if (!conservarReintentoPendiente) {
        actualizarOperacionDevolucion(null)
      }
      setErrorDevolucion(
        errorRegistro?.resultadoIncierto
          ? 'No se pudo confirmar el resultado. Se conservaron la clave y el motivo para reintentar la misma devolución.'
          : errorRegistro?.message ||
              'No fue posible registrar la devolución de efectivo.',
      )
      if (errorRegistro?.status === 409) {
        setVersionDevolucion((version) => version + 1)
      }
      if ([401, 403].includes(errorRegistro?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      if (
        componenteActivoRef.current &&
        generacionDevolucionRef.current === contexto.generacion
      ) {
        controladorDevolucionRef.current = null
        registrandoDevolucionRef.current = false
        setRegistrandoDevolucion(false)
      }
    }
  }

  if (cargando && !detalle) {
    return <section className="estado-ventas" aria-live="polite">Cargando venta...</section>
  }

  if (!detalle) {
    return (
      <section className="estado-ventas estado-error-ventas">
        <p role="alert">{error || 'La venta no está disponible.'}</p>
        <button className="boton-secundario-ventas" type="button" onClick={alVolver}>
          Volver al historial
        </button>
      </section>
    )
  }

  const { venta, recibo, detalles, movimientos_inventario: movimientos } = detalle
  const estaConfirmada = venta.estado === 'confirmada'
  const esFacturaDemostracion =
    documentoImpresion === 'factura-demostracion'
  const esReciboImpreso = documentoImpresion === 'recibo'
  const tienePagoEfectivo =
    venta.monto_recibido !== null &&
    venta.monto_recibido !== undefined &&
    venta.cambio !== null &&
    venta.cambio !== undefined
  const devolucionRegistrada =
    estadoDevolucion?.devolucion_registrada === true
  const puedePrepararDevolucion =
    puedeRegistrarDevolucion &&
    estadoDevolucion?.estado_venta === 'anulada' &&
    estadoDevolucion?.tiene_ingreso_caja === true &&
    !devolucionRegistrada

  return (
    <article
      className={`detalle-venta documento-venta${
        esFacturaDemostracion
          ? ' factura-demostracion-activa'
          : esReciboImpreso
            ? ' recibo-venta-activo'
            : ''
      }`}
    >
      <header className="encabezado-detalle-venta no-imprimir-ventas">
        <div>
          <p className="etiqueta-seccion-ventas">Detalle de venta</p>
          <div className="titulo-documento-venta">
            <h1>{venta.numero}</h1>
            <span className={`estado-venta estado-venta-${venta.estado}`}>
              {estaConfirmada ? 'Confirmada' : 'Anulada'}
            </span>
          </div>
          <p>Confirmada el {mostrarFecha(venta.fecha_confirmacion)}</p>
        </div>
        <div className="acciones-detalle-venta">
          <button className="boton-secundario-ventas" type="button" onClick={alVolver}>
            Volver
          </button>
          {recibo && (
            <button className="boton-documento-ventas boton-recibo-ventas" type="button" onClick={() => imprimirDocumento('recibo')}>
              Imprimir / PDF
            </button>
          )}
          <button
            className="boton-documento-ventas boton-factura-ventas"
            type="button"
            onClick={() => imprimirDocumento('factura-demostracion')}
          >
            Imprimir factura
          </button>
          {!recibo && puedeCrear && estaConfirmada && (
            <button className="boton-primario-ventas" type="button" onClick={emitirRecibo} disabled={procesando}>
              {procesando ? 'Emitiendo...' : 'Emitir recibo'}
            </button>
          )}
          {puedeAnular && estaConfirmada && (
            <button
              className="boton-peligro-ventas"
              type="button"
              onClick={() => setMostrarAnulacion((actual) => !actual)}
              disabled={procesando}
              aria-expanded={mostrarAnulacion}
            >
              Anular venta
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="mensaje-ventas mensaje-error-ventas no-imprimir-ventas" role="alert">
          {error}
        </p>
      )}

      {mostrarAnulacion && estaConfirmada && (
        <form className="panel-anulacion-venta no-imprimir-ventas" onSubmit={confirmarAnulacion}>
          <div>
            <strong>Anular venta y reintegrar inventario</strong>
            <p>Esta acción devolverá exactamente los manojos vendidos. La venta y su recibo se conservarán.</p>
          </div>
          <label htmlFor="motivo-anulacion-venta">Motivo *</label>
          <textarea
            id="motivo-anulacion-venta"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={400}
            rows="3"
            disabled={procesando}
          />
          <div>
            <button className="boton-secundario-ventas" type="button" onClick={() => setMostrarAnulacion(false)} disabled={procesando}>
              Cancelar
            </button>
            <button className="boton-peligro-ventas" type="submit" disabled={procesando}>
              {procesando ? 'Anulando...' : 'Confirmar anulación'}
            </button>
          </div>
        </form>
      )}

      <section className="cabecera-recibo-venta">
        <div className="identidad-recibo-venta">
          <img
            className="logo-documento-venta"
            src={logoEfarm}
            alt="E-farm"
          />
          <span>
            {esFacturaDemostracion
              ? 'Documento comercial demostrativo'
              : 'Sistema administrativo'}
          </span>
        </div>
        <div className="referencia-recibo-venta">
          <span className="tipo-documento-venta">
            {esFacturaDemostracion
              ? 'FACTURA DE DEMOSTRACIÓN'
              : recibo
                ? 'RECIBO'
                : 'COMPROBANTE DE VENTA'}
          </span>
          {esFacturaDemostracion ? (
            <>
              <strong>Venta {venta.numero}</strong>
              <small>Comprobante de facturación para fines demostrativos</small>
              <span>{mostrarFecha(venta.fecha_confirmacion)}</span>
            </>
          ) : (
            <>
              <strong>{recibo?.numero ?? 'Recibo no emitido'}</strong>
              <small>Serie {recibo?.serie_usuario_snapshot ?? venta.serie_usuario_snapshot}</small>
              <span>Venta {venta.numero}</span>
            </>
          )}
        </div>
      </section>

      {esFacturaDemostracion && (
        <p className="leyenda-factura-demostracion">
          Documento de demostración académica. No constituye un DTE ni una
          factura FEL certificada.
        </p>
      )}

      <section className="datos-documento-venta" aria-label="Información de la venta">
        <div className="tarjeta-dato-venta">
          <span>Comprador</span>
          <strong>{venta.comprador_nombre}</strong>
          <small>NIT {venta.comprador_nit}</small>
          <small>{venta.comprador_direccion || 'Dirección no indicada'}</small>
          <em>{venta.tipo_comprador === 'registrado' ? 'Cliente registrado' : 'Comprador ocasional'}</em>
        </div>
        <div className="tarjeta-dato-venta">
          <span>Documento</span>
          <dl>
            <div><dt>Venta</dt><dd>{venta.numero}</dd></div>
            <div><dt>Fecha</dt><dd>{mostrarFecha(recibo?.fecha_emision ?? venta.fecha_confirmacion)}</dd></div>
            <div><dt>Usuario</dt><dd>{venta.usuario_creador?.nombre_completo ?? '—'}</dd></div>
            <div><dt>Origen</dt><dd>{venta.origen === 'cotizacion' ? 'Cotización' : 'Venta directa'}</dd></div>
          </dl>
        </div>
      </section>

      <section className="seccion-detalle-venta" aria-labelledby="productos-detalle-venta">
        <div className="titulo-seccion-detalle-venta">
          <div>
            <h2 id="productos-detalle-venta">Productos</h2>
            <p>Precios y descripciones conservados al confirmar la venta.</p>
          </div>
          <span>{detalles.length} {detalles.length === 1 ? 'línea' : 'líneas'}</span>
        </div>
        <div className="desplazamiento-tabla-ventas">
          <table className="tabla-detalle-venta">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Presentación</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Manojos</th>
                <th scope="col">Precio</th>
                <th scope="col">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((linea) => (
                <tr key={linea.id}>
                  <td data-label="Producto">
                    <strong>{linea.codigo_sku}</strong>
                    <small>{linea.producto_nombre} · {linea.color} · {linea.longitud_cm} cm · {linea.clasificacion}</small>
                  </td>
                  <td data-label="Presentación">
                    <strong>{linea.presentacion_nombre}</strong>
                    <small>
                      {formatearManojosPorUnidad(
                        linea.cantidad_manojos_presentacion,
                      )}
                    </small>
                  </td>
                  <td data-label="Cantidad">{linea.cantidad_presentaciones}</td>
                  <td data-label="Manojos">{linea.cantidad_manojos}</td>
                  <td data-label="Precio">{formatoMoneda.format(Number(linea.precio_unitario))}</td>
                  <td data-label="Subtotal"><strong>{formatoMoneda.format(Number(linea.subtotal))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cierre-detalle-venta">
        <div>
          <h2>Observaciones</h2>
          <p>{venta.observaciones || 'Sin observaciones.'}</p>
        </div>
        <dl>
          <div><dt>Subtotal</dt><dd>{formatoMoneda.format(Number(venta.subtotal))}</dd></div>
          <div className="total-final-venta"><dt>TOTAL</dt><dd>{formatoMoneda.format(Number(venta.total))}</dd></div>
          {tienePagoEfectivo && !esFacturaDemostracion && (
            <>
              <div className="pago-recibido-venta"><dt>RECIBIDO</dt><dd>{formatoMoneda.format(Number(venta.monto_recibido))}</dd></div>
              <div className="cambio-pago-venta"><dt>CAMBIO</dt><dd>{formatoMoneda.format(Number(venta.cambio))}</dd></div>
            </>
          )}
        </dl>
      </section>

      {venta.estado === 'anulada' && (
        <section className="nota-anulacion-venta">
          <strong>Venta anulada</strong>
          <p>{venta.motivo_anulacion}</p>
          <small>
            {mostrarFecha(venta.fecha_anulacion)} · {venta.usuario_anulacion?.nombre_completo ?? 'Usuario no disponible'}
          </small>
        </section>
      )}

      {venta.estado === 'anulada' && puedeConsultarDevolucion && (
        <section
          ref={estadoDevolucionRef}
          className="estado-devolucion-venta no-imprimir-ventas"
          tabIndex={-1}
        >
          <div className="encabezado-devolucion-venta">
            <div>
              <span>Operación independiente</span>
              <h2>Devolución monetaria</h2>
            </div>
            {devolucionRegistrada && (
              <span className="insignia-devolucion-registrada">
                Efectivo devuelto
              </span>
            )}
          </div>

          {mensajeDevolucion && (
            <p className="mensaje-ventas mensaje-exito-ventas" role="status">
              {mensajeDevolucion}
            </p>
          )}

          {cargandoDevolucion ? (
            <p className="estado-consulta-devolucion" aria-live="polite">
              Consultando estado de devolución...
            </p>
          ) : errorConsultaDevolucion ? (
            <div className="error-consulta-devolucion" role="alert">
              <p>{errorConsultaDevolucion}</p>
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={() =>
                  setVersionDevolucion((version) => version + 1)
                }
              >
                Reintentar consulta
              </button>
            </div>
          ) : devolucionRegistrada ? (
            <dl className="datos-devolucion-venta">
              <div>
                <dt>Importe devuelto</dt>
                <dd>
                  {formatoMoneda.format(
                    Number(estadoDevolucion.devolucion.importe_devuelto),
                  )}
                </dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>
                  {mostrarFecha(estadoDevolucion.devolucion.fecha_movimiento)}
                </dd>
              </div>
              <div>
                <dt>Motivo</dt>
                <dd>{estadoDevolucion.devolucion.motivo}</dd>
              </div>
            </dl>
          ) : estadoDevolucion?.tiene_ingreso_caja === false ? (
            <p className="estado-consulta-devolucion">
              Esta venta no registró un ingreso de efectivo válido en Caja.
            </p>
          ) : estadoDevolucion ? (
            <div className="devolucion-pendiente-venta">
              <div>
                <strong>La anulación no devuelve dinero automáticamente.</strong>
                <p>
                  Importe pendiente de devolución:{' '}
                  <b>{formatoMoneda.format(Number(estadoDevolucion.total))}</b>
                </p>
              </div>
              {puedePrepararDevolucion && (
                <button
                  className="boton-peligro-ventas"
                  type="button"
                  onClick={(evento) =>
                    abrirDialogoDevolucion(evento.currentTarget)
                  }
                >
                  {operacionDevolucion
                    ? 'Reintentar devolución'
                    : 'Registrar devolución'}
                </button>
              )}
            </div>
          ) : null}
        </section>
      )}

      <details className="auditoria-inventario-venta no-imprimir-ventas">
        <summary>Ver movimientos de inventario ({movimientos.length})</summary>
        <ul>
          {movimientos.map((movimiento) => (
            <li key={movimiento.id}>
              <strong>{movimiento.tipo === 'salida' ? 'Salida' : 'Entrada'} {movimiento.variacion_manojos > 0 ? '+' : ''}{movimiento.variacion_manojos}</strong>
              <span>{movimiento.origen === 'venta' ? 'Confirmación de venta' : 'Anulación de venta'} · saldo {movimiento.saldo_anterior} → {movimiento.saldo_posterior}</span>
            </li>
          ))}
        </ul>
      </details>

      {mostrarDevolucion && estadoDevolucion && (
        <div
          className="fondo-dialogo-ventas no-imprimir-ventas"
          role="presentation"
          onMouseDown={(evento) => {
            if (
              evento.target === evento.currentTarget &&
              !registrandoDevolucion
            ) {
              cerrarDialogoDevolucion()
            }
          }}
        >
          <section
            ref={dialogoDevolucionRef}
            className="dialogo-des-ventas dialogo-devolucion-ventas"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-devolucion-venta"
            aria-describedby="descripcion-devolucion-venta"
            tabIndex={-1}
          >
            <header>
              <div>
                <h2 id="titulo-devolucion-venta">Registrar devolución</h2>
                <p id="descripcion-devolucion-venta">
                  Venta {venta.numero} · El efectivo se entregará desde tu
                  caja abierta.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancelar devolución"
                disabled={registrandoDevolucion}
                onClick={cerrarDialogoDevolucion}
              >
                ×
              </button>
            </header>
            <form onSubmit={confirmarDevolucion}>
              <div className="contenido-des-ventas contenido-devolucion-ventas">
                <div className="importe-devolucion-ventas">
                  <span>Importe que se devolverá en efectivo</span>
                  <strong>
                    {formatoMoneda.format(Number(estadoDevolucion.total))}
                  </strong>
                  <small>
                    El importe proviene de la venta y no puede modificarse.
                  </small>
                </div>
                <label htmlFor="motivo-devolucion-venta">
                  Motivo de la devolución *
                </label>
                <textarea
                  id="motivo-devolucion-venta"
                  value={motivoDevolucion}
                  onChange={(evento) =>
                    setMotivoDevolucion(evento.target.value)
                  }
                  maxLength={500}
                  rows={4}
                  disabled={
                    registrandoDevolucion ||
                    cargandoDevolucion ||
                    devolucionRegistrada ||
                    Boolean(operacionDevolucion)
                  }
                  required
                />
                <p className="advertencia-devolucion-ventas">
                  Confirma solamente cuando el dinero vaya a entregarse
                  físicamente al comprador.
                </p>
                {operacionDevolucion && !registrandoDevolucion && (
                  <p className="aviso-reintento-devolucion">
                    Reintento protegido: se conservarán la clave y el motivo
                    originales.
                  </p>
                )}
                {errorDevolucion && (
                  <p className="mensaje-ventas mensaje-error-ventas" role="alert">
                    {errorDevolucion}
                  </p>
                )}
              </div>
              <footer className="acciones-dialogo-devolucion">
                <button
                  className="boton-secundario-ventas"
                  type="button"
                  onClick={cerrarDialogoDevolucion}
                  disabled={registrandoDevolucion}
                >
                  Cancelar
                </button>
                <button
                  className="boton-peligro-ventas"
                  type="submit"
                  disabled={
                    registrandoDevolucion ||
                    cargandoDevolucion ||
                    devolucionRegistrada
                  }
                >
                  {registrandoDevolucion
                    ? 'Registrando...'
                    : operacionDevolucion
                      ? 'Reintentar devolución'
                      : 'Confirmar devolución'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </article>
  )
}

export default DetalleVenta
