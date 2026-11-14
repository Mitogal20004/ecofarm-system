import { useCallback, useEffect, useState } from 'react'
import DetalleVarianteDialog from '../components/DetalleVarianteDialog'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import VarianteProductoDialog from '../components/VarianteProductoDialog'
import { Eye, Pencil } from 'lucide-react'
import { listarPresentaciones, listarVariantes } from '../services/productos'
import { convertirACentimetros, UNIDADES_LONGITUD } from '../utils/medidas'
import './Productos.css'

const LIMITE_VARIANTES = 10
const LIMITES_LONGITUD = { mm: 5000, cm: 500, m: 5, in: 200, ft: 20 }
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_VARIANTES,
  total: 0,
  total_paginas: 0,
}

const nombreClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

const formatearMoneda = (valor) =>
  new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  }).format(Number(valor))

const obtenerMensajeConsulta = (error) => {
  if (error?.status === 403) return 'No tienes permiso para consultar productos.'
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  return 'No fue posible cargar las variantes de Snapdragon.'
}

function Productos({ permisos, alRefrescarAutorizacion }) {
  const [variantes, setVariantes] = useState([])
  const [presentaciones, setPresentaciones] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [filtroLongitudMin, setFiltroLongitudMin] = useState(0)
  const [filtroLongitudMax, setFiltroLongitudMax] = useState(LIMITES_LONGITUD.cm)
  const [filtroLongitudMinAplicado, setFiltroLongitudMinAplicado] = useState(0)
  const [filtroLongitudMaxAplicado, setFiltroLongitudMaxAplicado] = useState(LIMITES_LONGITUD.cm)
  const [unidadLongitud, setUnidadLongitud] = useState('cm')
  const [filtroColor, setFiltroColor] = useState('todos')
  const [coloresDisponibles, setColoresDisponibles] = useState([])
  const [filtroClasificacion, setFiltroClasificacion] = useState('todas')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [varianteEditando, setVarianteEditando] = useState(null)
  const [varianteDetalleId, setVarianteDetalleId] = useState(null)
  const [versionListado, setVersionListado] = useState(0)

  const cerrarEdicion = useCallback(() => setVarianteEditando(null), [])
  const cerrarDetalle = useCallback(() => setVarianteDetalleId(null), [])

  useEffect(() => {
    let vistaActiva = true

    const consultar = async () => {
      setCargando(true)
      setError('')

      try {
        const [resultado, presentacionesActuales, resultadoColores] = await Promise.all([
          listarVariantes({
            pagina: 1,
            limite: 100,
            busqueda: filtroColor !== 'todos' ? filtroColor : undefined,
            clasificacion:
              filtroClasificacion === 'todas'
                ? undefined
                : filtroClasificacion,
            activo:
              filtroActivo === 'todos'
                ? undefined
                : filtroActivo === 'activos',
          }),
          listarPresentaciones(),
          listarVariantes({ pagina: 1, limite: 100, activo: true }),
        ])

        if (!vistaActiva) return
        const minimoCm = filtroLongitudMinAplicado > 0
          ? convertirACentimetros(filtroLongitudMinAplicado, unidadLongitud)
          : null
        const maximoCm = filtroLongitudMaxAplicado < LIMITES_LONGITUD[unidadLongitud]
          ? convertirACentimetros(filtroLongitudMaxAplicado, unidadLongitud)
          : null
        const variantesFiltradas = resultado.variantes.filter((variante) => (
          (minimoCm === null || variante.longitud_cm >= minimoCm)
          && (maximoCm === null || variante.longitud_cm <= maximoCm)
        ))
        const totalPaginas = Math.max(1, Math.ceil(variantesFiltradas.length / LIMITE_VARIANTES))
        setVariantes(variantesFiltradas.slice((pagina - 1) * LIMITE_VARIANTES, pagina * LIMITE_VARIANTES))
        setPaginacion({
          pagina,
          limite: LIMITE_VARIANTES,
          total: variantesFiltradas.length,
          total_paginas: totalPaginas,
        })
        setPresentaciones(presentacionesActuales)
        setColoresDisponibles(
          [...new Set(resultadoColores.variantes.map((variante) => variante.color).filter(Boolean))].sort(),
        )
      } catch (errorConsulta) {
        if (!vistaActiva) return
        setVariantes([])
        setPaginacion(PAGINACION_INICIAL)
        cerrarEdicion()
        cerrarDetalle()
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
    cerrarDetalle,
    cerrarEdicion,
    filtroActivo,
    filtroClasificacion,
    filtroLongitudMinAplicado,
    filtroLongitudMaxAplicado,
    unidadLongitud,
    filtroColor,
    pagina,
    versionListado,
  ])

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setFiltroLongitudMinAplicado(filtroLongitudMin)
      setFiltroLongitudMaxAplicado(filtroLongitudMax)
      setPagina(1)
    }, 1000)

    return () => clearTimeout(temporizador)
  }, [filtroLongitudMin, filtroLongitudMax])

  const cambiarUnidadLongitud = (evento) => {
    const unidad = evento.target.value
    setUnidadLongitud(unidad)
    setFiltroLongitudMin(0)
    setFiltroLongitudMax(LIMITES_LONGITUD[unidad])
    setFiltroLongitudMinAplicado(0)
    setFiltroLongitudMaxAplicado(LIMITES_LONGITUD[unidad])
    setPagina(1)
  }

  const abrirCreacion = () => {
    setMensajeExito('')
    setVarianteEditando({ nueva: true })
  }

  const abrirEdicion = (variante) => {
    setMensajeExito('')
    setVarianteEditando(variante)
  }

  const manejarGuardado = (_variante, editando) => {
    cerrarEdicion()
    setMensajeExito(
      editando
        ? 'Variante actualizada correctamente.'
        : 'Variante creada correctamente.',
    )
    if (!editando) setPagina(1)
    setVersionListado((version) => version + 1)
  }

  const manejarCambioPrecio = () => {
    setVersionListado((version) => version + 1)
  }

  const puedeCrear = permisos.includes('producto.crear')
  const puedeEditar = permisos.includes('producto.editar')
  const esCreacion = varianteEditando?.nueva === true
  const dialogoPermitido = esCreacion ? puedeCrear : puedeEditar
  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-productos" aria-labelledby="titulo-productos">
      <header className="encabezado-productos">
        <h1 id="titulo-productos">Productos</h1>
        {puedeCrear && (
          <button
            className="boton-nuevo-producto"
            type="button"
            onClick={abrirCreacion}
          >
            + Nueva variante
          </button>
        )}
      </header>

      {mensajeExito && (
        <p className="mensaje-exito-productos" role="status">
          {mensajeExito}
        </p>
      )}

      <div className="filtros-productos">
        <header className="encabezado-filtros-productos">
          <h2>Filtros</h2>
          {!cargando && (
            <span>
              {paginacion.total}{' '}
              {paginacion.total === 1 ? 'variante' : 'variantes'}
            </span>
          )}
        </header>
        <div className="control-busqueda-productos">
          <label htmlFor="busqueda-productos">Buscar variante</label>
          <div>
            <select
              id="busqueda-productos"
              value={filtroColor}
              onChange={(evento) => {
                setFiltroColor(evento.target.value)
                setPagina(1)
              }}
              disabled={cargando}
            >
              <option value="todos">Todas las variantes</option>
              {coloresDisponibles.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
        </div>

        <div className="control-filtro-productos control-longitud-productos">
          <div className="encabezado-rango-longitud">
            <label htmlFor="filtro-longitud-min-productos">Longitud</label>
            <select
              value={unidadLongitud}
              onChange={cambiarUnidadLongitud}
              disabled={cargando}
              aria-label="Unidad para filtrar longitud"
            >
              {UNIDADES_LONGITUD.map((unidad) => (
                <option key={unidad.valor} value={unidad.valor}>{unidad.valor}</option>
              ))}
            </select>
          </div>
          <div className="rango-longitud-producto">
            <input
              id="filtro-longitud-min-productos"
              type="range"
              min="0"
              max={LIMITES_LONGITUD[unidadLongitud]}
              step={unidadLongitud === 'm' ? '0.01' : '1'}
              value={filtroLongitudMin}
              onChange={(evento) => {
                setFiltroLongitudMin(Math.min(Number(evento.target.value), filtroLongitudMax))
                setPagina(1)
              }}
              disabled={cargando}
              aria-label="Longitud mínima"
            />
            <input
              type="range"
              min="0"
              max={LIMITES_LONGITUD[unidadLongitud]}
              step={unidadLongitud === 'm' ? '0.01' : '1'}
              value={filtroLongitudMax}
              onChange={(evento) => {
                setFiltroLongitudMax(Math.max(Number(evento.target.value), filtroLongitudMin))
                setPagina(1)
              }}
              disabled={cargando}
              aria-label="Longitud máxima"
            />
            <div className="valores-rango-longitud">
              <span>{filtroLongitudMin || 'Min'} {unidadLongitud}</span>
              <span>{filtroLongitudMax === LIMITES_LONGITUD[unidadLongitud] ? 'Max' : filtroLongitudMax} {unidadLongitud}</span>
            </div>
          </div>
        </div>

        <div className="control-filtro-productos">
          <label htmlFor="filtro-clasificacion-productos">Clasificación</label>
          <select
            id="filtro-clasificacion-productos"
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

        <div className="control-filtro-productos">
          <label htmlFor="filtro-estado-productos">Estado</label>
          <select
            id="filtro-estado-productos"
            value={filtroActivo}
            onChange={(evento) => {
              setFiltroActivo(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </div>

      <div className="contenedor-listado-productos">
        {cargando ? (
          <p className="estado-listado-productos" aria-live="polite">
            Consultando variantes...
          </p>
        ) : error ? (
          <p className="estado-listado-productos estado-error-productos" role="alert">
            {error}
          </p>
        ) : variantes.length === 0 ? (
          <p className="estado-listado-productos">No se encontraron variantes.</p>
        ) : (
          <div className="desplazamiento-tabla-productos">
            <table className="tabla-productos">
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Variante</th>
                  <th scope="col">Estado</th>
                  {presentaciones.map((presentacion) => (
                    <th scope="col" key={presentacion.id}>{presentacion.nombre}</th>
                  ))}
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {variantes.map((variante) => {
                  const preciosPorPresentacion = new Map(
                    variante.precios.map((precio) => [precio.presentacion_id, precio]),
                  )

                  return (
                    <tr key={variante.id}>
                      <td className="sku-producto-tabla" data-label="SKU">
                        {variante.codigo_sku}
                      </td>
                      <td className="variante-producto-tabla" data-label="Variante">
                        <strong>{variante.color}</strong>
                        <small>
                          {variante.longitud_cm} cm ·{' '}
                          {nombreClasificacion[variante.clasificacion]}
                        </small>
                      </td>
                      <td data-label="Estado">
                        <EstadoEtiqueta
                          tono={variante.activo ? 'positivo' : 'peligro'}
                        >
                          {variante.activo ? 'Activo' : 'Inactivo'}
                        </EstadoEtiqueta>
                      </td>
                      {presentaciones.map((presentacion) => {
                        const precio = preciosPorPresentacion.get(presentacion.id)
                        return (
                          <td
                            className="precio-producto-tabla"
                            data-label={presentacion.nombre}
                            key={presentacion.id}
                          >
                            {precio ? formatearMoneda(precio.precio) : 'Sin precio'}
                          </td>
                        )
                      })}
                      <td className="celda-acciones-productos" data-label="Acciones">
                        <div className="acciones-producto-tabla">
                          <button
                            className="boton-detalle-producto"
                            type="button"
                            onClick={() => setVarianteDetalleId(variante.id)}
                          >
                            <Eye size={15} strokeWidth={2.1} aria-hidden="true" />
                            Ver detalle
                          </button>
                          {puedeEditar && (
                            <button
                              className="boton-secundario-producto"
                              type="button"
                              onClick={() => abrirEdicion(variante)}
                            >
                              <Pencil size={15} strokeWidth={2.1} aria-hidden="true" />
                              Editar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!cargando && !error && (
          <footer className="paginacion-productos">
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

      {varianteEditando && dialogoPermitido && (
        <VarianteProductoDialog
          key={esCreacion ? 'nueva-variante' : varianteEditando.id}
          variante={esCreacion ? null : varianteEditando}
          alCerrar={cerrarEdicion}
          alGuardar={manejarGuardado}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      )}

      {varianteDetalleId && (
        <DetalleVarianteDialog
          key={varianteDetalleId}
          varianteId={varianteDetalleId}
          puedeEditar={puedeEditar}
          alCerrar={cerrarDetalle}
          alCambioPrecio={manejarCambioPrecio}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      )}
    </section>
  )
}

export default Productos
