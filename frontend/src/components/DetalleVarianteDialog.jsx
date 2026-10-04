import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarHistorialPrecios,
  obtenerDetalleVariante,
  registrarPrecio,
} from '../services/productos'

const formatearMoneda = (valor) =>
  new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  }).format(Number(valor))

const formatearFecha = (valor) =>
  valor
    ? new Intl.DateTimeFormat('es-GT', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(valor))
    : 'Actualidad'

const nombreClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

function DetalleVarianteDialog({
  varianteId,
  puedeEditar,
  alCerrar,
  alCambioPrecio,
  alRefrescarAutorizacion,
}) {
  const [detalle, setDetalle] = useState(null)
  const [historial, setHistorial] = useState([])
  const [filtroPresentacion, setFiltroPresentacion] = useState('todas')
  const [preciosNuevos, setPreciosNuevos] = useState({})
  const [guardandoPresentacion, setGuardandoPresentacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const botonCerrarRef = useRef(null)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const [detalleActual, historialActual] = await Promise.all([
        obtenerDetalleVariante(varianteId),
        listarHistorialPrecios(varianteId),
      ])
      setDetalle(detalleActual)
      setHistorial(historialActual)
    } catch (errorConsulta) {
      if (errorConsulta?.status === 404) {
        setError('La variante solicitada ya no existe.')
      } else if (errorConsulta?.status === 403) {
        setError('No tienes permiso para consultar esta variante.')
      } else if (errorConsulta?.status === 401) {
        setError('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else {
        setError('No fue posible cargar el detalle de la variante.')
      }

      if ([401, 403].includes(errorConsulta?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, varianteId])

  useEffect(() => {
    const temporizador = window.setTimeout(cargarDatos, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarDatos])

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => botonCerrarRef.current?.focus(),
      0,
    )
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape' && !guardandoPresentacion) alCerrar()
    }

    document.addEventListener('keydown', manejarTeclado)
    return () => {
      window.clearTimeout(temporizador)
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar, guardandoPresentacion])

  const manejarPrecio = async (presentacion) => {
    if (guardandoPresentacion) return
    const texto = (preciosNuevos[presentacion.presentacion_id] ?? '')
      .trim()
      .replace(',', '.')

    if (!/^\d{1,10}(\.\d{1,2})?$/.test(texto)) {
      setError('Ingresa un precio válido mayor que cero, con hasta dos decimales.')
      return
    }

    const precioNuevo = Number(texto)

    if (precioNuevo <= 0 || precioNuevo > 9999999999.99) {
      setError('Ingresa un precio válido mayor que cero, con hasta dos decimales.')
      return
    }

    const precioActual = presentacion.precio
    const descripcionCambio = precioActual === null
      ? `Registrar ${formatearMoneda(precioNuevo)} para ${presentacion.presentacion}`
      : `Cambiar precio de ${presentacion.presentacion} de ${formatearMoneda(
          precioActual,
        )} a ${formatearMoneda(precioNuevo)}`

    if (!window.confirm(`${descripcionCambio}. ¿Deseas continuar?`)) return

    setGuardandoPresentacion(presentacion.presentacion_id)
    setError('')
    setMensaje('')

    try {
      const resultado = await registrarPrecio(varianteId, {
        presentacion_id: presentacion.presentacion_id,
        precio: precioNuevo,
      })
      setPreciosNuevos((actuales) => ({
        ...actuales,
        [presentacion.presentacion_id]: '',
      }))
      setMensaje(
        resultado.cambio
          ? 'Precio actualizado correctamente.'
          : 'El precio indicado ya era el vigente; no se creó otro registro.',
      )
      await cargarDatos()
      if (resultado.cambio) alCambioPrecio()
    } catch (errorPrecio) {
      if (errorPrecio?.status === 403) {
        setError('No tienes permiso para modificar precios.')
      } else if (errorPrecio?.status === 409) {
        setError(
          'No fue posible registrar el precio. Verifica que la variante y la presentación estén activas.',
        )
      } else if (errorPrecio?.status === 401) {
        setError('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else {
        setError('No fue posible registrar el precio.')
      }

      if ([401, 403].includes(errorPrecio?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      setGuardandoPresentacion(null)
    }
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget && !guardandoPresentacion) {
      alCerrar()
    }
  }

  const historialVisible = filtroPresentacion === 'todas'
    ? historial
    : historial.filter(
        (registro) => registro.presentacion_id === filtroPresentacion,
      )

  return (
    <div className="fondo-dialogo-producto" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-producto dialogo-detalle-producto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalle-variante"
      >
        <header className="encabezado-dialogo-producto">
          <div>
            <p className="etiqueta-dialogo-producto">Productos</p>
            <h2 id="titulo-detalle-variante">Detalle de variante</h2>
            <p>Información comercial, precios vigentes e historial.</p>
          </div>
          <button
            ref={botonCerrarRef}
            className="boton-cerrar-dialogo-producto"
            type="button"
            onClick={alCerrar}
            disabled={Boolean(guardandoPresentacion)}
            aria-label="Cerrar detalle"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="contenido-detalle-producto">
          {cargando && !detalle ? (
            <p className="estado-listado-productos" aria-live="polite">
              Consultando variante...
            </p>
          ) : error && !detalle ? (
            <p className="mensaje-error-productos" role="alert">{error}</p>
          ) : detalle ? (
            <>
              <dl className="resumen-variante">
                <div><dt>Producto</dt><dd>{detalle.producto.nombre}</dd></div>
                <div><dt>SKU</dt><dd>{detalle.variante.codigo_sku}</dd></div>
                <div><dt>Color</dt><dd>{detalle.variante.color}</dd></div>
                <div><dt>Longitud</dt><dd>{detalle.variante.longitud_cm} cm</dd></div>
                <div>
                  <dt>Clasificación</dt>
                  <dd>{nombreClasificacion[detalle.variante.clasificacion]}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{detalle.variante.activo ? 'Activo' : 'Inactivo'}</dd>
                </div>
              </dl>

              {detalle.variante.observaciones && (
                <div className="observaciones-variante">
                  <strong>Observaciones</strong>
                  <p>{detalle.variante.observaciones}</p>
                </div>
              )}

              {mensaje && <p className="mensaje-exito-productos" role="status">{mensaje}</p>}
              {error && <p className="mensaje-error-productos" role="alert">{error}</p>}

              <section className="seccion-precios" aria-labelledby="titulo-precios-vigentes">
                <div className="encabezado-seccion-producto">
                  <div>
                    <h3 id="titulo-precios-vigentes">Presentaciones y precios</h3>
                    <p>Precio unitario vigente por unidad comercial.</p>
                  </div>
                </div>

                <div className="rejilla-precios-producto">
                  {detalle.precios.map((presentacion) => {
                    const puedeCambiar =
                      puedeEditar &&
                      detalle.variante.activo &&
                      presentacion.presentacion_activa

                    return (
                      <article
                        className="tarjeta-precio-producto"
                        key={presentacion.presentacion_id}
                      >
                        <div>
                          <h4>{presentacion.presentacion}</h4>
                          <small>{presentacion.cantidad_manojos} manojo(s)</small>
                        </div>
                        <strong className="precio-vigente-producto">
                          {presentacion.precio === null
                            ? 'Sin precio definido'
                            : formatearMoneda(presentacion.precio)}
                        </strong>

                        {puedeEditar && (
                          <div className="edicion-precio-producto">
                            <label htmlFor={`precio-${presentacion.presentacion_id}`}>
                              Precio nuevo (Q)
                            </label>
                            <div>
                              <input
                                id={`precio-${presentacion.presentacion_id}`}
                                inputMode="decimal"
                                value={
                                  preciosNuevos[presentacion.presentacion_id] ?? ''
                                }
                                onChange={(evento) => {
                                  setPreciosNuevos((actuales) => ({
                                    ...actuales,
                                    [presentacion.presentacion_id]: evento.target.value,
                                  }))
                                  setError('')
                                }}
                                placeholder="0.00"
                                disabled={!puedeCambiar || Boolean(guardandoPresentacion)}
                              />
                              <button
                                type="button"
                                onClick={() => manejarPrecio(presentacion)}
                                disabled={
                                  !puedeCambiar ||
                                  Boolean(guardandoPresentacion) ||
                                  !(preciosNuevos[presentacion.presentacion_id] ?? '').trim()
                                }
                              >
                                {guardandoPresentacion === presentacion.presentacion_id
                                  ? 'Guardando...'
                                  : 'Guardar'}
                              </button>
                            </div>
                            {!presentacion.presentacion_activa && (
                              <small>La presentación está inactiva.</small>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>

                {puedeEditar && !detalle.variante.activo && (
                  <p className="nota-precios-producto">
                    Reactiva la variante para registrar precios nuevos.
                  </p>
                )}
              </section>

              <section className="seccion-historial" aria-labelledby="titulo-historial-precios">
                <div className="encabezado-seccion-producto">
                  <div>
                    <h3 id="titulo-historial-precios">Historial de precios</h3>
                    <p>Los registros históricos son solo de consulta.</p>
                  </div>
                  <div className="filtro-historial-producto">
                    <label htmlFor="filtro-historial-presentacion">Presentación</label>
                    <select
                      id="filtro-historial-presentacion"
                      value={filtroPresentacion}
                      onChange={(evento) => setFiltroPresentacion(evento.target.value)}
                    >
                      <option value="todas">Todas</option>
                      {detalle.precios.map((presentacion) => (
                        <option
                          key={presentacion.presentacion_id}
                          value={presentacion.presentacion_id}
                        >
                          {presentacion.presentacion}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {historialVisible.length === 0 ? (
                  <p className="historial-vacio-producto">No hay precios registrados.</p>
                ) : (
                  <div className="desplazamiento-tabla-productos">
                    <table className="tabla-historial-productos">
                      <thead>
                        <tr>
                          <th scope="col">Presentación</th>
                          <th scope="col">Precio</th>
                          <th scope="col">Desde</th>
                          <th scope="col">Hasta</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialVisible.map((registro) => (
                          <tr key={registro.id}>
                            <td>{registro.presentacion}</td>
                            <td>{formatearMoneda(registro.precio)}</td>
                            <td>{formatearFecha(registro.vigente_desde)}</td>
                            <td>{formatearFecha(registro.vigente_hasta)}</td>
                            <td>{registro.estado === 'vigente' ? 'Vigente' : 'Histórico'}</td>
                            <td>{registro.usuario_registro?.nombre_completo ?? 'Usuario'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default DetalleVarianteDialog
