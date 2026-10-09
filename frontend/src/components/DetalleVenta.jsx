import { useCallback, useEffect, useRef, useState } from 'react'
import {
  anularVenta,
  generarReciboVenta,
  obtenerVenta,
} from '../services/ventas'

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

function DetalleVenta({
  ventaId,
  puedeAnular,
  puedeCrear,
  imprimirAlAbrir = false,
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
  const impresionSolicitadaRef = useRef(imprimirAlAbrir)
  const procesandoRef = useRef(false)

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

  useEffect(() => {
    if (!detalle?.recibo || !impresionSolicitadaRef.current) return undefined

    impresionSolicitadaRef.current = false
    const temporizador = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(temporizador)
  }, [detalle])

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
  const tienePagoEfectivo =
    venta.monto_recibido !== null &&
    venta.monto_recibido !== undefined &&
    venta.cambio !== null &&
    venta.cambio !== undefined

  return (
    <article className="detalle-venta documento-venta">
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
            <button className="boton-secundario-ventas" type="button" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
          )}
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
        <div>
          <p className="marca-recibo-venta">E-farm</p>
          <span>{recibo ? 'RECIBO' : 'COMPROBANTE DE VENTA'}</span>
        </div>
        <div>
          <strong>{recibo?.numero ?? 'Recibo no emitido'}</strong>
          <span>Venta {venta.numero}</span>
          <small>Serie {recibo?.serie_usuario_snapshot ?? venta.serie_usuario_snapshot}</small>
        </div>
      </section>

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
            <div><dt>Fecha</dt><dd>{mostrarFecha(recibo?.fecha_emision ?? venta.fecha_confirmacion)}</dd></div>
            <div><dt>Usuario</dt><dd>{venta.usuario_creador?.nombre_completo ?? '—'}</dd></div>
            <div><dt>Origen</dt><dd>{venta.origen === 'cotizacion' ? 'Cotización' : 'Venta directa'}</dd></div>
            {venta.cotizacion_id && <div><dt>Cotización origen</dt><dd>{venta.cotizacion_id}</dd></div>}
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
                    <small>{linea.cantidad_manojos_presentacion} manojos por unidad</small>
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
          {tienePagoEfectivo && (
            <>
              <div><dt>RECIBIDO</dt><dd>{formatoMoneda.format(Number(venta.monto_recibido))}</dd></div>
              <div><dt>CAMBIO</dt><dd>{formatoMoneda.format(Number(venta.cambio))}</dd></div>
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
    </article>
  )
}

export default DetalleVenta
