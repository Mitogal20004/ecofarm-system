import { useCallback, useEffect, useRef, useState } from 'react'
import HistorialInventarioDialog from '../components/HistorialInventarioDialog'
import MovimientoInventarioDialog from '../components/MovimientoInventarioDialog'
import StockMinimoDialog from '../components/StockMinimoDialog'
import { listarInventario } from '../services/inventario'
import './Inventario.css'

const LIMITE_INVENTARIO = 10
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_INVENTARIO,
  total: 0,
  total_paginas: 0,
}
const RESUMEN_INICIAL = {
  total_manojos: 0,
  variantes_con_stock: 0,
  variantes_stock_bajo: 0,
  variantes_sin_stock: 0,
}

const nombreClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

const nombreEstado = {
  disponible: 'Disponible',
  stock_bajo: 'Stock bajo',
  sin_stock: 'Sin stock',
}

const obtenerMensajeConsulta = (error) => {
  if (error?.status === 403) return 'No tienes permiso para consultar inventario.'
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  return 'No fue posible cargar el inventario.'
}

function MenuAccionesInventario({
  item,
  puedeAjustar,
  puedeVerMovimientos,
  alAjustar,
  alEditarStockMinimo,
  alVerHistorial,
}) {
  const [abierto, setAbierto] = useState(false)
  const [posicion, setPosicion] = useState({ top: 0, left: 0 })
  const contenedorRef = useRef(null)
  const botonRef = useRef(null)
  const menuId = `menu-acciones-inventario-${item.variante_id}`

  useEffect(() => {
    if (!abierto) return undefined

    const enfocarPrimeraOpcion = window.requestAnimationFrame(() => {
      contenedorRef.current
        ?.querySelector('[role="menuitem"]')
        ?.focus()
    })

    const manejarClicExterior = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) {
        setAbierto(false)
      }
    }

    const manejarEscape = (evento) => {
      if (evento.key !== 'Escape') return
      evento.preventDefault()
      setAbierto(false)
      botonRef.current?.focus()
    }

    const cerrarAlCambiarVista = () => setAbierto(false)

    document.addEventListener('pointerdown', manejarClicExterior)
    document.addEventListener('keydown', manejarEscape)
    window.addEventListener('resize', cerrarAlCambiarVista)
    window.addEventListener('scroll', cerrarAlCambiarVista, true)

    return () => {
      window.cancelAnimationFrame(enfocarPrimeraOpcion)
      document.removeEventListener('pointerdown', manejarClicExterior)
      document.removeEventListener('keydown', manejarEscape)
      window.removeEventListener('resize', cerrarAlCambiarVista)
      window.removeEventListener('scroll', cerrarAlCambiarVista, true)
    }
  }, [abierto])

  const alternarMenu = () => {
    if (abierto) {
      setAbierto(false)
      return
    }

    const limitesBoton = botonRef.current.getBoundingClientRect()
    const anchoMenu = Math.min(200, window.innerWidth - 24)
    const cantidadOpciones = (puedeAjustar ? 2 : 0) + (puedeVerMovimientos ? 1 : 0)
    const altoEstimado = cantidadOpciones * 40 + 12
    const abreHaciaAbajo =
      window.innerHeight - limitesBoton.bottom >= altoEstimado + 8

    setPosicion({
      top: abreHaciaAbajo
        ? limitesBoton.bottom + 6
        : Math.max(12, limitesBoton.top - altoEstimado - 6),
      left: Math.max(
        12,
        Math.min(limitesBoton.right - anchoMenu, window.innerWidth - anchoMenu - 12),
      ),
    })
    setAbierto(true)
  }

  const manejarTecladoMenu = (evento) => {
    const opciones = Array.from(
      evento.currentTarget.querySelectorAll('[role="menuitem"]'),
    )
    const indiceActual = opciones.indexOf(document.activeElement)
    let indiceSiguiente

    if (evento.key === 'ArrowDown') {
      indiceSiguiente = (indiceActual + 1) % opciones.length
    } else if (evento.key === 'ArrowUp') {
      indiceSiguiente =
        indiceActual <= 0 ? opciones.length - 1 : indiceActual - 1
    } else if (evento.key === 'Home') {
      indiceSiguiente = 0
    } else if (evento.key === 'End') {
      indiceSiguiente = opciones.length - 1
    } else {
      return
    }

    evento.preventDefault()
    opciones[indiceSiguiente]?.focus()
  }

  const ejecutarAccion = (accion) => {
    setAbierto(false)
    accion()
  }

  return (
    <div className="contenedor-menu-acciones-inventario" ref={contenedorRef}>
      <button
        ref={botonRef}
        className="accion-mas-inventario"
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
        onClick={alternarMenu}
      >
        Más
        <span aria-hidden="true">⌄</span>
      </button>

      {abierto && (
        <div
          id={menuId}
          className="menu-acciones-inventario"
          role="menu"
          aria-label={`Más acciones para ${item.codigo_sku}`}
          style={posicion}
          onKeyDown={manejarTecladoMenu}
        >
          {puedeAjustar && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => ejecutarAccion(alAjustar)}
              >
                Ajuste físico
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => ejecutarAccion(alEditarStockMinimo)}
              >
                Stock mínimo
              </button>
            </>
          )}
          {puedeVerMovimientos && (
            <button
              type="button"
              role="menuitem"
              onClick={() => ejecutarAccion(alVerHistorial)}
            >
              Historial
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Inventario({ permisos, alRefrescarAutorizacion }) {
  const [inventario, setInventario] = useState([])
  const [presentaciones, setPresentaciones] = useState([])
  const [resumen, setResumen] = useState(RESUMEN_INICIAL)
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [filtroLongitud, setFiltroLongitud] = useState('')
  const [filtroClasificacion, setFiltroClasificacion] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [operacion, setOperacion] = useState(null)
  const [itemStockMinimo, setItemStockMinimo] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [varianteHistorial, setVarianteHistorial] = useState(null)
  const [versionListado, setVersionListado] = useState(0)

  const cerrarOperacion = useCallback(() => setOperacion(null), [])
  const cerrarStockMinimo = useCallback(() => setItemStockMinimo(null), [])
  const cerrarHistorial = useCallback(() => {
    setHistorialAbierto(false)
    setVarianteHistorial(null)
  }, [])

  useEffect(() => {
    let vistaActiva = true

    const consultar = async () => {
      setCargando(true)
      setError('')

      try {
        const longitudNumero = Number(filtroLongitud)
        const longitudValida =
          /^\d+$/.test(filtroLongitud) && longitudNumero > 0
        const resultado = await listarInventario({
          pagina,
          limite: LIMITE_INVENTARIO,
          busqueda: busquedaAplicada || undefined,
          longitud_cm: longitudValida ? longitudNumero : undefined,
          clasificacion:
            filtroClasificacion === 'todas'
              ? undefined
              : filtroClasificacion,
          estado_stock: filtroEstado === 'todos' ? undefined : filtroEstado,
          activo:
            filtroActivo === 'todos'
              ? undefined
              : filtroActivo === 'activos',
        })

        if (!vistaActiva) return
        setInventario(resultado.inventario)
        setPresentaciones(resultado.presentaciones)
        setResumen(resultado.resumen)
        setPaginacion(resultado.paginacion)
      } catch (errorConsulta) {
        if (!vistaActiva) return
        setInventario([])
        setPresentaciones([])
        setResumen(RESUMEN_INICIAL)
        setPaginacion(PAGINACION_INICIAL)
        cerrarOperacion()
        cerrarStockMinimo()
        setError(obtenerMensajeConsulta(errorConsulta))

        if ([401, 403].includes(errorConsulta?.status)) {
          alRefrescarAutorizacion()
        }
      } finally {
        if (vistaActiva) setCargando(false)
      }
    }

    consultar()
    return () => {
      vistaActiva = false
    }
  }, [
    alRefrescarAutorizacion,
    busquedaAplicada,
    cerrarOperacion,
    cerrarStockMinimo,
    filtroActivo,
    filtroClasificacion,
    filtroEstado,
    filtroLongitud,
    pagina,
    versionListado,
  ])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  const manejarMovimientoGuardado = (resultado, tipo) => {
    cerrarOperacion()
    setMensaje(
      resultado.cambio
        ? `${tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : 'Ajuste'} registrado correctamente.`
        : 'El conteo coincide con el stock registrado; no se creó un movimiento.',
    )
    setVersionListado((version) => version + 1)
  }

  const manejarStockMinimoGuardado = () => {
    cerrarStockMinimo()
    setMensaje('Stock mínimo actualizado correctamente.')
    setVersionListado((version) => version + 1)
  }

  const abrirHistorial = (item = null) => {
    setVarianteHistorial(item)
    setHistorialAbierto(true)
  }

  const limpiarFiltros = () => {
    setBusqueda('')
    setBusquedaAplicada('')
    setFiltroLongitud('')
    setFiltroClasificacion('todas')
    setFiltroEstado('todos')
    setFiltroActivo('todos')
    setPagina(1)
  }

  const puedeVerMovimientos = permisos.includes('inventario.ver_movimientos')
  const puedeRegistrar = permisos.includes('inventario.registrar_movimiento')
  const puedeAjustar = permisos.includes('inventario.ajustar')
  const tieneAccionesSecundarias = puedeAjustar || puedeVerMovimientos
  const hayFiltrosActivos = Boolean(
    busqueda.trim() ||
      busquedaAplicada ||
      filtroLongitud ||
      filtroClasificacion !== 'todas' ||
      filtroEstado !== 'todos' ||
      filtroActivo !== 'todos',
  )
  const alertasResultados = inventario.filter(
    (item) => item.estado_stock === 'stock_bajo' || item.estado_stock === 'sin_stock',
  )
  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-inventario" aria-labelledby="titulo-inventario">
      <header className="encabezado-inventario">
        <div>
          <p className="etiqueta-seccion">Operación física</p>
          <h1 id="titulo-inventario">Inventario</h1>
          <p>Control de existencias y movimientos de Snapdragon.</p>
        </div>
        {puedeVerMovimientos && (
          <button
            className="boton-primario-inventario"
            type="button"
            onClick={() => abrirHistorial()}
          >
            Historial de movimientos
          </button>
        )}
      </header>

      {mensaje && (
        <p className="mensaje-exito-inventario" role="status">{mensaje}</p>
      )}

      <div className="resumen-inventario" aria-label="Resumen del inventario filtrado">
        <article className="tarjeta-resumen-inventario">
          <span>Total de manojos</span>
          <strong>{resumen.total_manojos}</strong>
          <small>Existencia física filtrada</small>
        </article>
        <article className="tarjeta-resumen-inventario">
          <span>Variantes con stock</span>
          <strong>{resumen.variantes_con_stock}</strong>
          <small>Con saldo mayor que cero</small>
        </article>
        <article className="tarjeta-resumen-inventario tarjeta-resumen-advertencia">
          <span>Stock bajo</span>
          <strong>{resumen.variantes_stock_bajo}</strong>
          <small>En o por debajo del mínimo</small>
        </article>
        <article className="tarjeta-resumen-inventario tarjeta-resumen-critico">
          <span>Sin stock</span>
          <strong>{resumen.variantes_sin_stock}</strong>
          <small>Con saldo igual a cero</small>
        </article>
      </div>
      <p className="nota-resumen-inventario">
        El resumen corresponde a todas las variantes que cumplen los filtros, no solo a esta página.
      </p>

      {!cargando && !error && inventario.length > 0 && (
        <section
          className="alertas-inventario"
          aria-labelledby="titulo-alertas-inventario"
        >
          <header className="encabezado-alertas-inventario">
            <div>
              <p className="etiqueta-seccion">Seguimiento</p>
              <h2 id="titulo-alertas-inventario">Alertas en resultados mostrados</h2>
            </div>
            <span>
              {alertasResultados.length}{' '}
              {alertasResultados.length === 1 ? 'alerta' : 'alertas'}
            </span>
          </header>

          {alertasResultados.length > 0 ? (
            <ul className="lista-alertas-inventario">
              {alertasResultados.map((item) => (
                <li key={item.variante_id}>
                  <div className="identidad-alerta-inventario">
                    <strong>{item.color}</strong>
                    <span>
                      {item.codigo_sku} · {item.longitud_cm} cm ·{' '}
                      {nombreClasificacion[item.clasificacion]}
                    </span>
                  </div>
                  <div className="estado-alerta-inventario">
                    <strong>{item.stock_manojos} manojos</strong>
                    <span className={`estado-stock estado-stock-${item.estado_stock}`}>
                      {nombreEstado[item.estado_stock]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sin-alertas-inventario">
              No hay alertas de stock en esta página de resultados.
            </p>
          )}
          <p className="nota-alertas-inventario">
            Esta lista corresponde únicamente a las variantes visibles en la página actual.
          </p>
        </section>
      )}

      <form className="filtros-inventario" onSubmit={manejarBusqueda}>
        <header className="encabezado-filtros-inventario">
          <div>
            <h2>Filtros</h2>
            <p>Localiza variantes y revisa su disponibilidad.</p>
          </div>
          {hayFiltrosActivos && (
            <button
              className="boton-limpiar-filtros-inventario"
              type="button"
              onClick={limpiarFiltros}
              disabled={cargando}
            >
              Limpiar filtros
            </button>
          )}
        </header>
        <div className="control-busqueda-inventario">
          <label htmlFor="busqueda-inventario">Buscar variante</label>
          <div>
            <input
              id="busqueda-inventario"
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
          <label htmlFor="longitud-inventario">Longitud (cm)</label>
          <input
            id="longitud-inventario"
            type="number"
            min="1"
            step="1"
            value={filtroLongitud}
            onChange={(evento) => {
              setFiltroLongitud(evento.target.value)
              setPagina(1)
            }}
            placeholder="Todas"
            disabled={cargando}
          />
        </div>
        <div className="control-filtro-inventario">
          <label htmlFor="clasificacion-inventario">Clasificación</label>
          <select
            id="clasificacion-inventario"
            value={filtroClasificacion}
            onChange={(evento) => {
              setFiltroClasificacion(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todas">Todas</option>
            <option value="normal">Normal</option>
            <option value="completa">Completa</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div className="control-filtro-inventario">
          <label htmlFor="estado-inventario">Estado de stock</label>
          <select
            id="estado-inventario"
            value={filtroEstado}
            onChange={(evento) => {
              setFiltroEstado(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todos">Todos</option>
            <option value="disponible">Disponible</option>
            <option value="stock_bajo">Stock bajo</option>
            <option value="sin_stock">Sin stock</option>
          </select>
        </div>
        <div className="control-filtro-inventario">
          <label htmlFor="activo-inventario">Estado de variante</label>
          <select
            id="activo-inventario"
            value={filtroActivo}
            onChange={(evento) => {
              setFiltroActivo(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todos">Todas</option>
            <option value="activos">Activas</option>
            <option value="inactivos">Inactivas</option>
          </select>
        </div>
      </form>

      <div className="contenedor-listado-inventario">
        {cargando ? (
          <p className="estado-listado-inventario" aria-live="polite">
            Consultando inventario...
          </p>
        ) : error ? (
          <p className="estado-listado-inventario estado-error-inventario" role="alert">
            {error}
          </p>
        ) : inventario.length === 0 ? (
          <p className="estado-listado-inventario">No se encontraron variantes.</p>
        ) : (
          <div className="desplazamiento-tabla-inventario">
            <table className="tabla-inventario">
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Variante</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventario.map((item) => (
                  <tr key={item.variante_id}>
                    <td className="sku-inventario" data-label="SKU">
                      {item.codigo_sku}
                    </td>
                    <td className="variante-inventario" data-label="Variante">
                      <strong>{item.color}</strong>
                      <small>
                        {item.longitud_cm} cm ·{' '}
                        {nombreClasificacion[item.clasificacion]}
                      </small>
                      <span className="estado-variante-inventario">
                        {item.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="stock-actual-inventario" data-label="Stock">
                      <strong>{item.stock_manojos} manojos</strong>
                      <details>
                        <summary>Ver equivalencias</summary>
                        <div className="contenido-equivalencias-inventario">
                          <strong>Equivalencias aproximadas</strong>
                          <ul>
                            {presentaciones.map((presentacion) => (
                              <li key={presentacion.id}>
                                <strong>
                                  {Math.floor(
                                    item.stock_manojos /
                                      presentacion.cantidad_manojos,
                                  )}
                                </strong>{' '}
                                {presentacion.cantidad_manojos === 1
                                  ? 'manojos individuales'
                                  : `cajas de ${presentacion.cantidad_manojos}`}
                              </li>
                            ))}
                          </ul>
                          <p>Son referencias comerciales, no existencias separadas.</p>
                        </div>
                      </details>
                    </td>
                    <td className="minimo-inventario" data-label="Mínimo">
                      {item.stock_minimo_manojos} manojos
                    </td>
                    <td className="estado-inventario" data-label="Estado">
                      <span className={`estado-stock estado-stock-${item.estado_stock}`}>
                        {nombreEstado[item.estado_stock]}
                      </span>
                    </td>
                    <td className="celda-acciones-inventario" data-label="Acciones">
                      <div className="acciones-inventario">
                        {puedeRegistrar && item.activo && (
                          <>
                            <button
                              className="accion-entrada-inventario"
                              type="button"
                              onClick={() => setOperacion({ tipo: 'entrada', item })}
                            >
                              Entrada
                            </button>
                            <button
                              className="accion-salida-inventario"
                              type="button"
                              onClick={() => setOperacion({ tipo: 'salida', item })}
                            >
                              Salida
                            </button>
                          </>
                        )}
                        {tieneAccionesSecundarias && (
                          <MenuAccionesInventario
                            item={item}
                            puedeAjustar={puedeAjustar}
                            puedeVerMovimientos={puedeVerMovimientos}
                            alAjustar={() => setOperacion({ tipo: 'ajuste', item })}
                            alEditarStockMinimo={() => setItemStockMinimo(item)}
                            alVerHistorial={() => abrirHistorial(item)}
                          />
                        )}
                        {puedeRegistrar && !item.activo && (
                          <small>Entradas y salidas bloqueadas</small>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
              {' · '}{paginacion.total} variantes
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

      {operacion && (
        <MovimientoInventarioDialog
          key={`${operacion.tipo}-${operacion.item.variante_id}`}
          tipo={operacion.tipo}
          item={operacion.item}
          alCerrar={cerrarOperacion}
          alGuardar={manejarMovimientoGuardado}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      )}

      {itemStockMinimo && (
        <StockMinimoDialog
          key={itemStockMinimo.variante_id}
          item={itemStockMinimo}
          alCerrar={cerrarStockMinimo}
          alGuardar={manejarStockMinimoGuardado}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      )}

      {historialAbierto && (
        <HistorialInventarioDialog
          varianteInicial={varianteHistorial}
          alCerrar={cerrarHistorial}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      )}
    </section>
  )
}

export default Inventario
