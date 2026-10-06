import { useCallback, useEffect, useRef, useState } from 'react'
import { listarMovimientos } from '../services/inventario'

const LIMITE_MOVIMIENTOS = 15
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_MOVIMIENTOS,
  total: 0,
  total_paginas: 0,
}

const nombreTipo = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

const nombreClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

const formatearFecha = (valor) =>
  new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(valor))

function HistorialInventarioDialog({
  varianteInicial,
  alCerrar,
  alRefrescarAutorizacion,
}) {
  const [movimientos, setMovimientos] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [varianteFiltro, setVarianteFiltro] = useState(varianteInicial ?? null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const botonCerrarRef = useRef(null)

  const consultar = useCallback(async () => {
    setCargando(true)
    setError('')

    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      setMovimientos([])
      setPaginacion(PAGINACION_INICIAL)
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      setCargando(false)
      return
    }

    try {
      const resultado = await listarMovimientos({
        pagina,
        limite: LIMITE_MOVIMIENTOS,
        busqueda: busquedaAplicada || undefined,
        variante_id: varianteFiltro?.variante_id,
        tipo: tipo === 'todos' ? undefined : tipo,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      })
      setMovimientos(resultado.movimientos)
      setPaginacion(resultado.paginacion)
    } catch (errorConsulta) {
      setMovimientos([])
      setPaginacion(PAGINACION_INICIAL)

      if (errorConsulta?.status === 403) {
        setError('No tienes permiso para consultar movimientos.')
      } else if (errorConsulta?.status === 401) {
        setError('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else {
        setError('No fue posible cargar el historial de movimientos.')
      }

      if ([401, 403].includes(errorConsulta?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      setCargando(false)
    }
  }, [
    alRefrescarAutorizacion,
    busquedaAplicada,
    fechaDesde,
    fechaHasta,
    pagina,
    tipo,
    varianteFiltro,
  ])

  useEffect(() => {
    const temporizador = window.setTimeout(consultar, 0)
    return () => window.clearTimeout(temporizador)
  }, [consultar])

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => botonCerrarRef.current?.focus(),
      0,
    )
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', manejarTeclado)
    return () => {
      window.clearTimeout(temporizador)
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <div
      className="fondo-dialogo-inventario"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
    >
      <section
        className="dialogo-inventario dialogo-historial-inventario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-historial-inventario"
      >
        <header className="encabezado-dialogo-inventario">
          <div>
            <p className="etiqueta-dialogo-inventario">Auditoría</p>
            <h2 id="titulo-historial-inventario">Historial de movimientos</h2>
            <p>Registro de solo lectura, ordenado del más reciente al más antiguo.</p>
          </div>
          <button
            ref={botonCerrarRef}
            className="boton-cerrar-dialogo-inventario"
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar historial"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="contenido-historial-inventario">
          {varianteFiltro && (
            <div className="filtro-variante-historial">
              <span>
                Variante: <strong>{varianteFiltro.codigo_sku} · {varianteFiltro.color}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setVarianteFiltro(null)
                  setPagina(1)
                }}
              >
                Ver todas
              </button>
            </div>
          )}

          <form className="filtros-historial-inventario" onSubmit={manejarBusqueda}>
            <div className="control-busqueda-inventario">
              <label htmlFor="busqueda-historial-inventario">Buscar variante</label>
              <div>
                <input
                  id="busqueda-historial-inventario"
                  type="search"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="SKU o color"
                  maxLength={150}
                />
                <button type="submit" disabled={cargando}>Buscar</button>
              </div>
            </div>
            <div className="control-filtro-inventario">
              <label htmlFor="tipo-historial-inventario">Tipo</label>
              <select
                id="tipo-historial-inventario"
                value={tipo}
                onChange={(evento) => {
                  setTipo(evento.target.value)
                  setPagina(1)
                }}
                disabled={cargando}
              >
                <option value="todos">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </div>
            <div className="control-filtro-inventario">
              <label htmlFor="fecha-desde-inventario">Desde</label>
              <input
                id="fecha-desde-inventario"
                type="date"
                value={fechaDesde}
                onChange={(evento) => {
                  setFechaDesde(evento.target.value)
                  setPagina(1)
                }}
                disabled={cargando}
              />
            </div>
            <div className="control-filtro-inventario">
              <label htmlFor="fecha-hasta-inventario">Hasta</label>
              <input
                id="fecha-hasta-inventario"
                type="date"
                value={fechaHasta}
                onChange={(evento) => {
                  setFechaHasta(evento.target.value)
                  setPagina(1)
                }}
                disabled={cargando}
              />
            </div>
          </form>

          <div className="contenedor-historial-inventario">
            {cargando ? (
              <p className="estado-listado-inventario" aria-live="polite">
                Consultando movimientos...
              </p>
            ) : error ? (
              <p className="mensaje-error-inventario" role="alert">{error}</p>
            ) : movimientos.length === 0 ? (
              <p className="estado-listado-inventario">No se encontraron movimientos.</p>
            ) : (
              <div className="desplazamiento-tabla-inventario">
                <table className="tabla-historial-inventario">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Variante</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Variación</th>
                      <th scope="col">Anterior</th>
                      <th scope="col">Nuevo</th>
                      <th scope="col">Motivo</th>
                      <th scope="col">Origen</th>
                      <th scope="col">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((movimiento) => (
                      <tr key={movimiento.id}>
                        <td><code>{movimiento.id}</code></td>
                        <td>{formatearFecha(movimiento.fecha_movimiento)}</td>
                        <td>
                          <strong>{movimiento.variante.codigo_sku}</strong>
                          <small>
                            {movimiento.variante.color} · {movimiento.variante.longitud_cm} cm · {' '}
                            {nombreClasificacion[movimiento.variante.clasificacion]}
                          </small>
                        </td>
                        <td>{nombreTipo[movimiento.tipo]}</td>
                        <td className={
                          movimiento.variacion_manojos > 0
                            ? 'variacion-positiva'
                            : 'variacion-negativa'
                        }>
                          {movimiento.variacion_manojos > 0 ? '+' : ''}
                          {movimiento.variacion_manojos}
                        </td>
                        <td>{movimiento.saldo_anterior}</td>
                        <td>{movimiento.saldo_posterior}</td>
                        <td>{movimiento.motivo}</td>
                        <td>{movimiento.origen}</td>
                        <td>{movimiento.usuario?.nombre_completo ?? 'Usuario'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!cargando && !error && (
            <footer className="paginacion-inventario">
              <button
                type="button"
                onClick={() => setPagina((actual) => actual - 1)}
                disabled={!puedeRetroceder}
              >
                Anterior
              </button>
              <span>
                Página {paginacion.pagina} de {Math.max(paginacion.total_paginas, 1)}
                {' · '}{paginacion.total} movimientos
              </span>
              <button
                type="button"
                onClick={() => setPagina((actual) => actual + 1)}
                disabled={!puedeAvanzar}
              >
                Siguiente
              </button>
            </footer>
          )}
        </div>
      </section>
    </div>
  )
}

export default HistorialInventarioDialog
