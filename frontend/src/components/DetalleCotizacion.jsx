import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cambiarEstadoCotizacion,
  obtenerCotizacion,
} from '../services/cotizaciones'

const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const formatoFechaHora = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
})

const etiquetasEstado = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  anulada: 'Anulada',
  convertida: 'Convertida',
}

const mostrarFecha = (valor) =>
  valor ? formatoFechaHora.format(new Date(valor)) : '—'

function DetalleCotizacion({
  cotizacionId,
  puedeEditar,
  alVolver,
  alEditar,
  alActualizar,
}) {
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const procesandoRef = useRef(false)

  const cargarDetalle = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      setDetalle(await obtenerCotizacion(cotizacionId))
    } catch (errorCarga) {
      setError(errorCarga?.message || 'No fue posible cargar la cotización.')
    } finally {
      setCargando(false)
    }
  }, [cotizacionId])

  useEffect(() => {
    const temporizador = window.setTimeout(cargarDetalle, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarDetalle])

  const cambiarEstado = async (estado) => {
    if (procesandoRef.current || !detalle) return

    const esEmision = estado === 'emitida'
    const confirmado = window.confirm(
      esEmision
        ? '¿Deseas emitir esta cotización? Después ya no podrá editarse.'
        : '¿Deseas anular esta cotización? Esta acción no se puede revertir.',
    )
    if (!confirmado) return

    procesandoRef.current = true
    setProcesando(true)
    setError('')

    try {
      await cambiarEstadoCotizacion(cotizacionId, estado)
      await cargarDetalle()
      await alActualizar()
    } catch (errorCambio) {
      setError(
        errorCambio?.message || 'No fue posible cambiar el estado de la cotización.',
      )
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  if (cargando) {
    return (
      <section className="estado-cotizaciones" aria-live="polite">
        Cargando cotización...
      </section>
    )
  }

  if (!detalle) {
    return (
      <section className="estado-cotizaciones estado-error-cotizaciones">
        <p role="alert">{error || 'La cotización no está disponible.'}</p>
        <button className="boton-secundario-cotizaciones" type="button" onClick={alVolver}>
          Volver al listado
        </button>
      </section>
    )
  }

  const { cotizacion, detalles } = detalle
  const esBorrador = cotizacion.estado === 'borrador'
  const puedeAnular = ['borrador', 'emitida'].includes(cotizacion.estado)

  return (
    <article className="detalle-cotizacion documento-cotizacion">
      <header className="encabezado-cotizaciones encabezado-detalle-cotizacion no-imprimir">
        <div>
          <p className="etiqueta-seccion-cotizaciones">Detalle de cotización</p>
          <div className="titulo-documento-cotizacion">
            <h1>{cotizacion.numero}</h1>
            <span className={`estado-cotizacion estado-cotizacion-${cotizacion.estado}`}>
              {etiquetasEstado[cotizacion.estado] ?? cotizacion.estado}
            </span>
          </div>
          <p>Creada el {mostrarFecha(cotizacion.fecha_creacion)}</p>
        </div>
        <div className="acciones-encabezado-cotizacion no-imprimir">
          <button className="boton-secundario-cotizaciones" type="button" onClick={alVolver}>
            Volver
          </button>
          <button
            className="boton-secundario-cotizaciones"
            type="button"
            onClick={() => window.print()}
          >
            Imprimir / PDF
          </button>
          {puedeEditar && esBorrador && (
            <button className="boton-secundario-cotizaciones" type="button" onClick={alEditar}>
              Editar
            </button>
          )}
          {puedeEditar && esBorrador && (
            <button
              className="boton-primario-cotizaciones"
              type="button"
              onClick={() => cambiarEstado('emitida')}
              disabled={procesando}
            >
              {procesando ? 'Procesando...' : 'Emitir'}
            </button>
          )}
          {puedeEditar && puedeAnular && (
            <button
              className="boton-peligro-cotizaciones"
              type="button"
              onClick={() => cambiarEstado('anulada')}
              disabled={procesando}
            >
              Anular
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="mensaje-cotizaciones mensaje-error-cotizaciones no-imprimir" role="alert">
          {error}
        </p>
      )}

      <section className="cabecera-impresion-cotizacion">
        <div>
          <p className="marca-impresion-cotizacion">E-farm</p>
          <span>Cotización comercial</span>
        </div>
        <div>
          <strong>{cotizacion.numero}</strong>
          <span>Serie {cotizacion.serie_usuario_snapshot}</span>
        </div>
      </section>

      <section className="datos-detalle-cotizacion" aria-label="Información de la cotización">
        <div className="tarjeta-dato-cotizacion">
          <span>Comprador</span>
          <strong>{cotizacion.comprador_nombre}</strong>
          <small>NIT {cotizacion.comprador_nit}</small>
          <small>{cotizacion.comprador_direccion || 'Dirección no indicada'}</small>
          <span className="tipo-comprador-cotizacion">
            {cotizacion.tipo_comprador === 'registrado'
              ? 'Cliente registrado'
              : 'Comprador ocasional'}
          </span>
        </div>
        <div className="tarjeta-dato-cotizacion">
          <span>Documento</span>
          <dl>
            <div>
              <dt>Creado por</dt>
              <dd>{cotizacion.usuario_creador?.nombre_completo ?? '—'}</dd>
            </div>
            <div>
              <dt>Emisión</dt>
              <dd>{mostrarFecha(cotizacion.fecha_emision)}</dd>
            </div>
            <div>
              <dt>Última actualización</dt>
              <dd>{mostrarFecha(cotizacion.fecha_actualizacion)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="seccion-detalle-cotizacion" aria-labelledby="lineas-detalle-cotizacion">
        <div className="titulo-seccion-detalle-cotizacion">
          <div>
            <h2 id="lineas-detalle-cotizacion">Detalle de productos</h2>
            <p>Precios y descripciones conservados al guardar la cotización.</p>
          </div>
          <span>{detalles.length} {detalles.length === 1 ? 'línea' : 'líneas'}</span>
        </div>
        <div className="contenedor-tabla-cotizaciones">
          <div className="desplazamiento-tabla-cotizaciones">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Presentación</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Manojos</th>
                  <th scope="col">Precio unitario</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detalles.map((linea) => (
                  <tr key={linea.id}>
                    <td data-label="#">{linea.numero_linea}</td>
                    <td data-label="Producto">
                      <strong>{linea.codigo_sku}</strong>
                      <small>
                        {linea.producto_nombre} · {linea.color} · {linea.longitud_cm} cm · {linea.clasificacion}
                      </small>
                    </td>
                    <td data-label="Presentación">
                      <strong>{linea.presentacion_nombre}</strong>
                      <small>{linea.cantidad_manojos_presentacion} manojos por unidad</small>
                    </td>
                    <td data-label="Cantidad">{linea.cantidad_presentaciones}</td>
                    <td data-label="Manojos">{linea.cantidad_manojos}</td>
                    <td data-label="Precio unitario">
                      {formatoMoneda.format(Number(linea.precio_unitario))}
                    </td>
                    <td data-label="Subtotal">
                      <strong>{formatoMoneda.format(Number(linea.subtotal))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="cierre-detalle-cotizacion">
        <div>
          <h2>Observaciones</h2>
          <p>{cotizacion.observaciones || 'Sin observaciones.'}</p>
        </div>
        <dl className="totales-detalle-cotizacion">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatoMoneda.format(Number(cotizacion.subtotal))}</dd>
          </div>
          <div className="total-final-detalle-cotizacion">
            <dt>Total</dt>
            <dd>{formatoMoneda.format(Number(cotizacion.total))}</dd>
          </div>
        </dl>
      </section>

      {cotizacion.estado === 'anulada' && (
        <p className="nota-estado-documento-cotizacion">
          Documento anulado el {mostrarFecha(cotizacion.fecha_anulacion)}.
        </p>
      )}
    </article>
  )
}

export default DetalleCotizacion
