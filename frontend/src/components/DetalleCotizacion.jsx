import { useCallback, useEffect, useRef, useState } from 'react'
import logoEfarm from '../assets/logo-efarm-brand.png'
import EstadoEtiqueta from './EstadoEtiqueta'
import {
  crearDocumentoCotizacion,
  descargarPDFTicket,
  verPDFTicket,
  imprimirTicket,
} from '../utils/documentosComerciales'
import {
  cambiarEstadoCotizacion,
  obtenerCotizacion,
} from '../services/cotizaciones'
import { convertirCotizacionVenta } from '../services/ventas'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'

const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const tonosEstado = {
  borrador: 'neutro',
  emitida: 'advertencia',
  convertida: 'positivo',
  anulada: 'peligro',
}

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
  puedeConvertir,
  alVolver,
  alEditar,
  alAbrirVenta,
  alActualizar,
  alRefrescarAutorizacion,
}) {
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [ventaCreada, setVentaCreada] = useState(null)
  const [mostrarPagoConversion, setMostrarPagoConversion] = useState(false)
  const [montoRecibido, setMontoRecibido] = useState('')
  const procesandoRef = useRef(false)
  const totalCotizacion = Number(detalle?.cotizacion?.total ?? 0)
  const montoValido = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(
    montoRecibido,
  )
  const montoNumero = montoValido ? Number(montoRecibido) : 0
  const cambioConversion = montoValido
    ? Math.round((montoNumero - totalCotizacion) * 100) / 100
    : null

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

  const convertirEnVenta = async () => {
    if (procesandoRef.current || !detalle) return
    if (!montoValido || montoNumero <= 0) {
      setError('Ingresa el monto recibido en efectivo.')
      return
    }
    if (cambioConversion < 0) {
      setError(
        `Faltan ${formatoMoneda.format(Math.abs(cambioConversion))}.`,
      )
      return
    }
    if (
      !window.confirm(
        'Se creará la venta con los precios guardados en la cotización y se descontará el inventario. ¿Deseas continuar?',
      )
    ) {
      return
    }

    procesandoRef.current = true
    setProcesando(true)
    setError('')

    try {
      const resultado = await convertirCotizacionVenta(
        cotizacionId,
        montoRecibido,
      )
      setVentaCreada(resultado)
      setMostrarPagoConversion(false)
      await cargarDetalle()
      await alActualizar()
    } catch (errorConversion) {
      setError(
        errorConversion?.message ||
          'No fue posible convertir la cotización en venta.',
      )
      if ([401, 403].includes(errorConversion?.status)) {
        alRefrescarAutorizacion?.()
      }
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
  const verDocumento = () => {
    try {
      verPDFTicket(crearDocumentoCotizacion(detalle))
      setError('')
    } catch (errorPrevia) {
      setError(errorPrevia?.message || 'No fue posible abrir la vista previa.')
    }
  }

  const descargarDocumento = () => {
    try {
      descargarPDFTicket(crearDocumentoCotizacion(detalle))
      setError('')
    } catch (errorDescarga) {
      setError(errorDescarga?.message || 'No fue posible descargar el PDF.')
    }
  }

  const imprimirTicketDocumento = () => {
    try {
      imprimirTicket(crearDocumentoCotizacion(detalle))
      setError('')
    } catch (errorImpresion) {
      setError(errorImpresion?.message || 'No fue posible imprimir la cotización.')
    }
  }

  const esBorrador = cotizacion.estado === 'borrador'
  const puedeAnular = ['borrador', 'emitida'].includes(cotizacion.estado)

  return (
    <article className="detalle-cotizacion documento-cotizacion">
      <header className="encabezado-cotizaciones encabezado-detalle-cotizacion no-imprimir">
        <div>
          <p className="etiqueta-seccion-cotizaciones">Detalle de cotización</p>
          <div className="titulo-documento-cotizacion">
            <h1>{cotizacion.numero}</h1>
            <EstadoEtiqueta
              tono={tonosEstado[cotizacion.estado] ?? 'neutro'}
            >
              {etiquetasEstado[cotizacion.estado] ?? cotizacion.estado}
            </EstadoEtiqueta>
          </div>
          <p>Creada el {mostrarFecha(cotizacion.fecha_creacion)}</p>
        </div>
        <div className="acciones-encabezado-cotizacion no-imprimir">
          <button className="boton-secundario-cotizaciones" type="button" onClick={alVolver}>
            Volver
          </button>
          <button className="boton-secundario-cotizaciones" type="button" onClick={verDocumento}>
            Vista previa
          </button>
          <button className="boton-secundario-cotizaciones" type="button" onClick={descargarDocumento}>
            Descargar PDF
          </button>
          <button className="boton-primario-cotizaciones" type="button" onClick={imprimirTicketDocumento}>
            Imprimir
          </button>
          <details className="opciones-documentos-efarm">
            <summary>Más opciones</summary>
            <button className="boton-secundario-cotizaciones" type="button" onClick={() => window.print()}>
              Imprimir en carta
            </button>
          </details>
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
          {puedeConvertir && cotizacion.estado === 'emitida' && (
            <button
              className="boton-primario-cotizaciones"
              type="button"
              onClick={() => {
                setMostrarPagoConversion((actual) => !actual)
                setError('')
              }}
              disabled={procesando}
              aria-expanded={mostrarPagoConversion}
            >
              Convertir a venta
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="mensaje-cotizaciones mensaje-error-cotizaciones no-imprimir" role="alert">
          {error}
        </p>
      )}

      {puedeConvertir &&
        cotizacion.estado === 'emitida' &&
        mostrarPagoConversion && (
          <section className="panel-pago-conversion-cotizacion no-imprimir" aria-labelledby="titulo-pago-conversion">
            <div>
              <p className="etiqueta-seccion-cotizaciones">Pago en efectivo</p>
              <h2 id="titulo-pago-conversion">Completar conversión a venta</h2>
              <p>PostgreSQL conservará el total cotizado y calculará el cambio.</p>
            </div>
            <dl>
              <div><dt>Total</dt><dd>{formatoMoneda.format(totalCotizacion)}</dd></div>
              <div>
                <dt>{cambioConversion !== null && cambioConversion < 0 ? 'Faltan' : 'Cambio'}</dt>
                <dd className={cambioConversion !== null && cambioConversion < 0 ? 'monto-insuficiente-cotizacion' : ''}>
                  {formatoMoneda.format(Math.abs(cambioConversion ?? 0))}
                </dd>
              </div>
            </dl>
            <label htmlFor="monto-conversion-cotizacion">Pago recibido *</label>
            <div className="control-pago-conversion-cotizacion">
              <input
                id="monto-conversion-cotizacion"
                type="text"
                inputMode="decimal"
                value={montoRecibido}
                onChange={(evento) => {
                  const valor = evento.target.value.replace(',', '.')
                  if (valor === '' || /^\d{0,12}(?:\.\d{0,2})?$/.test(valor)) {
                    setMontoRecibido(valor)
                    setError('')
                  }
                }}
                placeholder="0.00"
                disabled={procesando}
              />
              <button
                className="boton-secundario-cotizaciones"
                type="button"
                onClick={() => {
                  setMontoRecibido(totalCotizacion.toFixed(2))
                  setError('')
                }}
                disabled={procesando}
              >
                Exacto
              </button>
            </div>
            <div className="acciones-pago-conversion-cotizacion">
              <button
                className="boton-secundario-cotizaciones"
                type="button"
                onClick={() => setMostrarPagoConversion(false)}
                disabled={procesando}
              >
                Cancelar
              </button>
              <button
                className="boton-primario-cotizaciones"
                type="button"
                onClick={convertirEnVenta}
                disabled={
                  procesando ||
                  !montoValido ||
                  montoNumero <= 0 ||
                  cambioConversion < 0
                }
              >
                {procesando ? 'Convirtiendo...' : 'Confirmar conversión'}
              </button>
            </div>
          </section>
        )}

      {ventaCreada && (
        <section className="resultado-conversion-cotizacion no-imprimir" aria-live="polite">
          <div>
            <strong>Cotización convertida correctamente</strong>
            <p>
              Venta {ventaCreada.venta.numero} · Recibo {ventaCreada.recibo.numero}
            </p>
            <p>
              Total {formatoMoneda.format(Number(ventaCreada.venta.total))} ·
              Recibido {formatoMoneda.format(Number(ventaCreada.venta.monto_recibido))} ·
              Cambio {formatoMoneda.format(Number(ventaCreada.venta.cambio))}
            </p>
          </div>
          {alAbrirVenta && (
            <button
              className="boton-secundario-cotizaciones"
              type="button"
              onClick={() => alAbrirVenta(ventaCreada.venta.id)}
            >
              Ver venta y recibo
            </button>
          )}
        </section>
      )}

      <section
        className="cabecera-impresion-cotizacion"
        aria-label="Encabezado de la cotización"
      >
        <div className="identidad-documento-cotizacion">
          <img
            className="logo-documento-cotizacion"
            src={logoEfarm}
            alt="E-farm"
          />
          <span>Sistema administrativo</span>
        </div>
        <div className="referencia-documento-cotizacion">
          <strong>{cotizacion.numero}</strong>
          <span>
            Fecha: {mostrarFecha(
              cotizacion.fecha_emision ?? cotizacion.fecha_creacion,
            )}
          </span>
          <small>Serie {cotizacion.serie_usuario_snapshot}</small>
        </div>
        <h2>Cotización</h2>
      </section>

      <section className="datos-detalle-cotizacion" aria-label="Información de la cotización">
        <div className="tarjeta-dato-cotizacion">
          <span>Datos del cliente</span>
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
            <table className="tabla-detalle-cotizacion">
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
                      <small>
                        {formatearManojosPorUnidad(
                          linea.cantidad_manojos_presentacion,
                        )}
                      </small>
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

      <footer className="pie-documento-cotizacion">
        Documento generado por E-farm.
      </footer>
    </article>
  )
}

export default DetalleCotizacion
