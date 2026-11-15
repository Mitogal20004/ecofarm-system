import { useCallback, useEffect, useState } from 'react'
import DetalleVarianteDialog from '../components/DetalleVarianteDialog'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import VarianteProductoDialog from '../components/VarianteProductoDialog'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  PackagePlus,
  Pencil,
} from 'lucide-react'
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
  const [selectorUnidadAbierto, setSelectorUnidadAbierto] = useState(false)
  const [filtroColor, setFiltroColor] = useState('todos')
  const [coloresDisponibles, setColoresDisponibles] = useState([])
  const [selectorColorAbierto, setSelectorColorAbierto] = useState(false)
  const [filtroClasificacion, setFiltroClasificacion] = useState('todas')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [selectorClasificacionAbierto, setSelectorClasificacionAbierto] = useState(false)
  const [selectorEstadoAbierto, setSelectorEstadoAbierto] = useState(false)
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
            <PackagePlus size={17} strokeWidth={2} aria-hidden="true" />
            Nueva variante
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
            <div className="selector-color-productos">
              <button
              id="busqueda-productos"
              className="boton-selector-color-productos"
              type="button"
              onClick={() => setSelectorColorAbierto((abierto) => !abierto)}
              disabled={cargando}
              aria-haspopup="listbox"
              aria-expanded={selectorColorAbierto}
              >
                {filtroColor === 'todos' ? 'Todas las variantes' : filtroColor}
                <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
              </button>
              {selectorColorAbierto && (
                <div className="lista-colores-productos" role="listbox" aria-label="Selecciona una variante">
                  <button
                    type="button"
                    role="option"
                    aria-selected={filtroColor === 'todos'}
                    onClick={() => {
                      setFiltroColor('todos')
                      setPagina(1)
                      setSelectorColorAbierto(false)
                    }}
                  >
                    Todas las variantes
                  </button>
                  {coloresDisponibles.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="option"
                      aria-selected={color === filtroColor}
                      onClick={() => {
                        setFiltroColor(color)
                        setPagina(1)
                        setSelectorColorAbierto(false)
                      }}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="control-filtro-productos control-longitud-productos">
          <div className="encabezado-rango-longitud">
            <label htmlFor="filtro-longitud-min-productos">Longitud</label>
            <div className="selector-unidad-productos">
              <button
              id="unidad-longitud-productos"
              className="boton-selector-unidad-productos"
              type="button"
              onClick={() => setSelectorUnidadAbierto((abierto) => !abierto)}
              disabled={cargando}
              aria-haspopup="listbox"
              aria-expanded={selectorUnidadAbierto}
              aria-label="Unidad para filtrar longitud"
              >
                {unidadLongitud}
                <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
              </button>
              {selectorUnidadAbierto && (
                <div className="lista-unidades-productos" role="listbox" aria-label="Selecciona una unidad">
                  {UNIDADES_LONGITUD.map((unidad) => (
                    <button
                      key={unidad.valor}
                      type="button"
                      role="option"
                      aria-selected={unidad.valor === unidadLongitud}
                      onClick={() => {
                        cambiarUnidadLongitud({ target: { value: unidad.valor } })
                        setSelectorUnidadAbierto(false)
                      }}
                    >
                      {unidad.valor}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
          <div className="selector-clasificacion-productos">
            <button
            id="filtro-clasificacion-productos"
            className="boton-selector-clasificacion-productos"
            type="button"
            onClick={() => setSelectorClasificacionAbierto((abierto) => !abierto)}
            disabled={cargando}
            aria-haspopup="listbox"
            aria-expanded={selectorClasificacionAbierto}
            >
              {filtroClasificacion === 'todas'
                ? 'Todas'
                : nombreClasificacion[filtroClasificacion]}
              <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
            </button>
            {selectorClasificacionAbierto && (
              <div className="lista-clasificaciones-productos" role="listbox" aria-label="Selecciona una clasificación">
                {[
                  ['todas', 'Todas'],
                  ['normal', 'Normal'],
                  ['completa', 'Completa'],
                  ['premium', 'Premium'],
                ].map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="option"
                    aria-selected={valor === filtroClasificacion}
                    onClick={() => {
                      setFiltroClasificacion(valor)
                      setPagina(1)
                      setSelectorClasificacionAbierto(false)
                    }}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="control-filtro-productos">
          <label htmlFor="filtro-estado-productos">Estado</label>
          <div className="selector-estado-productos">
            <button
            id="filtro-estado-productos"
            className="boton-selector-estado-productos"
            type="button"
            onClick={() => setSelectorEstadoAbierto((abierto) => !abierto)}
            disabled={cargando}
            aria-haspopup="listbox"
            aria-expanded={selectorEstadoAbierto}
            >
              {filtroActivo === 'todos' ? 'Todos' : filtroActivo === 'activos' ? 'Activos' : 'Inactivos'}
              <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
            </button>
            {selectorEstadoAbierto && (
              <div className="lista-estados-productos" role="listbox" aria-label="Selecciona un estado">
                {[
                  ['todos', 'Todos'],
                  ['activos', 'Activos'],
                  ['inactivos', 'Inactivos'],
                ].map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="option"
                    aria-selected={valor === filtroActivo}
                    onClick={() => {
                      setFiltroActivo(valor)
                      setPagina(1)
                      setSelectorEstadoAbierto(false)
                    }}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              className="boton-paginacion-flecha-productos"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft size={19} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <span>
              Página {paginacion.pagina} de {Math.max(paginacion.total_paginas, 1)}
              {' · '}{paginacion.total} variantes
            </span>
            <button
              type="button"
              onClick={() => setPagina((actual) => actual + 1)}
              disabled={!puedeAvanzar}
              className="boton-paginacion-flecha-productos"
              aria-label="Página siguiente"
              title="Página siguiente"
            >
              <ChevronRight size={19} strokeWidth={2.25} aria-hidden="true" />
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
