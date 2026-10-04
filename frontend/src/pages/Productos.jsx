import { useCallback, useEffect, useState } from 'react'
import DetalleVarianteDialog from '../components/DetalleVarianteDialog'
import VarianteProductoDialog from '../components/VarianteProductoDialog'
import { listarPresentaciones, listarVariantes } from '../services/productos'
import './Productos.css'

const LIMITE_VARIANTES = 10
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
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [filtroLongitud, setFiltroLongitud] = useState('')
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
        const [resultado, presentacionesActuales] = await Promise.all([
          listarVariantes({
            pagina,
            limite: LIMITE_VARIANTES,
            busqueda: busquedaAplicada || undefined,
            longitud_cm: filtroLongitud
              ? Number(filtroLongitud)
              : undefined,
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
        ])

        if (!vistaActiva) return
        setVariantes(resultado.variantes)
        setPaginacion(resultado.paginacion)
        setPresentaciones(presentacionesActuales)
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
    busquedaAplicada,
    cerrarDetalle,
    cerrarEdicion,
    filtroActivo,
    filtroClasificacion,
    filtroLongitud,
    pagina,
    versionListado,
  ])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
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
  const coloresPagina = new Set(
    variantes.filter((variante) => variante.activo).map((variante) => variante.color),
  ).size
  const premiumPagina = variantes.filter(
    (variante) => variante.activo && variante.clasificacion === 'premium',
  ).length
  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-productos" aria-labelledby="titulo-productos">
      <header className="encabezado-productos">
        <div>
          <p className="etiqueta-seccion">Catálogo comercial</p>
          <h1 id="titulo-productos">Productos</h1>
          <p>Gestión de variantes y precios de Snapdragon.</p>
        </div>
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

      <div className="resumen-productos" aria-label="Resumen del catálogo">
        <article><span>Variantes encontradas</span><strong>{paginacion.total}</strong></article>
        <article><span>Colores activos en página</span><strong>{coloresPagina}</strong></article>
        <article><span>Premium activas en página</span><strong>{premiumPagina}</strong></article>
        <article><span>Presentaciones</span><strong>{presentaciones.length}</strong></article>
      </div>

      <form className="filtros-productos" onSubmit={manejarBusqueda}>
        <div className="control-busqueda-productos">
          <label htmlFor="busqueda-productos">Buscar variante</label>
          <div>
            <input
              id="busqueda-productos"
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="SKU o color"
              maxLength={150}
            />
            <button type="submit" disabled={cargando}>Buscar</button>
          </div>
        </div>

        <div className="control-filtro-productos">
          <label htmlFor="filtro-longitud-productos">Longitud (cm)</label>
          <input
            id="filtro-longitud-productos"
            type="number"
            min="1"
            step="1"
            value={filtroLongitud}
            onChange={(evento) => {
              setFiltroLongitud(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
            placeholder="Todas"
          />
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
      </form>

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
                  <th scope="col">Clasificación</th>
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
                      <td className="sku-producto-tabla">{variante.codigo_sku}</td>
                      <td className="variante-producto-tabla">
                        <strong>{variante.color}</strong>
                        <small>{variante.longitud_cm} cm</small>
                      </td>
                      <td>{nombreClasificacion[variante.clasificacion]}</td>
                      <td>
                        <span className={`estado-producto ${
                          variante.activo
                            ? 'estado-producto-activo'
                            : 'estado-producto-inactivo'
                        }`}>
                          {variante.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {presentaciones.map((presentacion) => {
                        const precio = preciosPorPresentacion.get(presentacion.id)
                        return (
                          <td className="precio-producto-tabla" key={presentacion.id}>
                            {precio ? formatearMoneda(precio.precio) : 'Sin precio'}
                          </td>
                        )
                      })}
                      <td>
                        <div className="acciones-producto-tabla">
                          <button
                            className="boton-secundario-producto"
                            type="button"
                            onClick={() => setVarianteDetalleId(variante.id)}
                          >
                            Ver detalle
                          </button>
                          {puedeEditar && (
                            <button
                              className="boton-secundario-producto"
                              type="button"
                              onClick={() => abrirEdicion(variante)}
                            >
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
