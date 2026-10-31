import { useCallback, useEffect, useState } from 'react'
import CotizacionFormulario from '../components/CotizacionFormulario'
import DetalleCotizacion from '../components/DetalleCotizacion'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import { listarCotizaciones } from '../services/cotizaciones'
import './Cotizaciones.css'

const LIMITE_COTIZACIONES = 10
const tonosEstado = {
  borrador: 'neutro',
  emitida: 'advertencia',
  convertida: 'positivo',
  anulada: 'peligro',
}
const FILTROS_INICIALES = {
  busqueda: '',
  estado: '',
  fecha_desde: '',
  fecha_hasta: '',
}
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_COTIZACIONES,
  total: 0,
  total_paginas: 0,
}
const etiquetasEstado = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  anulada: 'Anulada',
  convertida: 'Convertida',
}
const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})
const formatoFecha = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeZone: 'America/Guatemala',
})

const mostrarFecha = (valor) =>
  valor ? formatoFecha.format(new Date(valor)) : '—'

function Cotizaciones({
  permisos = [],
  alRefrescarAutorizacion,
  alAbrirVenta,
}) {
  const [cotizaciones, setCotizaciones] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [filtrosEdicion, setFiltrosEdicion] = useState(FILTROS_INICIALES)
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('listado')
  const [cotizacionId, setCotizacionId] = useState(null)
  const [versionListado, setVersionListado] = useState(0)

  const puedeCrear = permisos.includes('cotizacion.crear')
  const puedeEditar = permisos.includes('cotizacion.editar')
  const puedeConvertir = permisos.includes('cotizacion.convertir')

  const cargarListado = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const resultado = await listarCotizaciones({
        pagina,
        limite: LIMITE_COTIZACIONES,
        ...filtrosAplicados,
      })
      setCotizaciones(resultado.cotizaciones)
      setPaginacion(resultado.paginacion)
    } catch (errorCarga) {
      setCotizaciones([])
      setPaginacion(PAGINACION_INICIAL)
      setError(
        errorCarga?.status === 403
          ? 'No tienes permiso para consultar cotizaciones.'
          : errorCarga?.message || 'No fue posible cargar las cotizaciones.',
      )
      if ([401, 403].includes(errorCarga?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, filtrosAplicados, pagina])

  useEffect(() => {
    if (vista !== 'listado') return undefined

    const temporizador = window.setTimeout(cargarListado, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarListado, versionListado, vista])

  const actualizarFiltro = (evento) => {
    const { name, value } = evento.target
    setFiltrosEdicion((actuales) => ({ ...actuales, [name]: value }))
  }

  const aplicarFiltros = (evento) => {
    evento.preventDefault()

    if (
      filtrosEdicion.fecha_desde &&
      filtrosEdicion.fecha_hasta &&
      filtrosEdicion.fecha_desde > filtrosEdicion.fecha_hasta
    ) {
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }

    setError('')
    setPagina(1)
    setFiltrosAplicados({
      ...filtrosEdicion,
      busqueda: filtrosEdicion.busqueda.trim(),
    })
  }

  const limpiarFiltros = () => {
    setFiltrosEdicion(FILTROS_INICIALES)
    setFiltrosAplicados(FILTROS_INICIALES)
    setPagina(1)
    setError('')
  }

  const abrirDetalle = (id) => {
    setCotizacionId(id)
    setVista('detalle')
  }

  const abrirFormulario = (id = null) => {
    setCotizacionId(id)
    setVista('formulario')
  }

  const volverAlListado = () => {
    setVista('listado')
    setCotizacionId(null)
  }

  const mostrarDetalleGuardado = async (id) => {
    setVersionListado((version) => version + 1)
    setCotizacionId(id)
    setVista('detalle')
  }

  if (vista === 'formulario') {
    return (
      <CotizacionFormulario
        cotizacionId={cotizacionId}
        alCancelar={cotizacionId ? () => setVista('detalle') : volverAlListado}
        alGuardado={mostrarDetalleGuardado}
      />
    )
  }

  if (vista === 'detalle' && cotizacionId) {
    return (
      <DetalleCotizacion
        cotizacionId={cotizacionId}
        puedeEditar={puedeEditar}
        puedeConvertir={puedeConvertir}
        alVolver={volverAlListado}
        alEditar={() => abrirFormulario(cotizacionId)}
        alAbrirVenta={
          permisos.includes('venta.ver') ? alAbrirVenta : undefined
        }
        alRefrescarAutorizacion={alRefrescarAutorizacion}
        alActualizar={async () =>
          setVersionListado((version) => version + 1)
        }
      />
    )
  }

  return (
    <section className="pagina-cotizaciones" aria-labelledby="titulo-cotizaciones">
      <header className="encabezado-cotizaciones">
        <h1 id="titulo-cotizaciones">Cotizaciones</h1>
        {puedeCrear && (
          <button
            className="boton-primario-cotizaciones"
            type="button"
            onClick={() => abrirFormulario()}
          >
            Nueva cotización
          </button>
        )}
      </header>

      <form className="filtros-cotizaciones" onSubmit={aplicarFiltros}>
        <div className="encabezado-filtros-cotizaciones">
          <strong>Buscar cotizaciones</strong>
          <button
            className="boton-limpiar-cotizaciones"
            type="button"
            onClick={limpiarFiltros}
          >
            Limpiar filtros
          </button>
        </div>
        <div className="campo-filtro-cotizaciones campo-busqueda-cotizaciones">
          <label htmlFor="busqueda-cotizaciones">Búsqueda</label>
          <input
            id="busqueda-cotizaciones"
            name="busqueda"
            value={filtrosEdicion.busqueda}
            onChange={actualizarFiltro}
            maxLength={200}
            placeholder="Número, comprador o NIT"
          />
        </div>
        <div className="campo-filtro-cotizaciones">
          <label htmlFor="estado-cotizaciones">Estado</label>
          <select
            id="estado-cotizaciones"
            name="estado"
            value={filtrosEdicion.estado}
            onChange={actualizarFiltro}
          >
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="emitida">Emitida</option>
            <option value="anulada">Anulada</option>
            <option value="convertida">Convertida</option>
          </select>
        </div>
        <div className="campo-filtro-cotizaciones">
          <label htmlFor="fecha-desde-cotizaciones">Desde</label>
          <input
            id="fecha-desde-cotizaciones"
            name="fecha_desde"
            type="date"
            value={filtrosEdicion.fecha_desde}
            onChange={actualizarFiltro}
          />
        </div>
        <div className="campo-filtro-cotizaciones">
          <label htmlFor="fecha-hasta-cotizaciones">Hasta</label>
          <input
            id="fecha-hasta-cotizaciones"
            name="fecha_hasta"
            type="date"
            value={filtrosEdicion.fecha_hasta}
            onChange={actualizarFiltro}
          />
        </div>
        <button className="boton-primario-cotizaciones boton-buscar-cotizaciones" type="submit">
          Buscar
        </button>
      </form>

      <section className="seccion-listado-cotizaciones" aria-labelledby="listado-cotizaciones">
        <div className="encabezado-listado-cotizaciones">
          <div>
            <h2 id="listado-cotizaciones">Historial de cotizaciones</h2>
            <p>{paginacion.total} documentos encontrados</p>
          </div>
        </div>
        <div className="contenedor-tabla-cotizaciones">
          {cargando ? (
            <p className="estado-cotizaciones" aria-live="polite">
              Cargando cotizaciones...
            </p>
          ) : error ? (
            <p className="estado-cotizaciones estado-error-cotizaciones" role="alert">
              {error}
            </p>
          ) : cotizaciones.length === 0 ? (
            <p className="estado-cotizaciones">No se encontraron cotizaciones.</p>
          ) : (
            <div className="desplazamiento-tabla-cotizaciones">
              <table className="tabla-cotizaciones">
                <thead>
                  <tr>
                    <th scope="col">Cotización</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Serie / usuario</th>
                    <th scope="col">Total</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cotizaciones.map((cotizacion) => (
                    <tr key={cotizacion.id}>
                      <td data-label="Cotización">
                        <strong className="numero-cotizacion">{cotizacion.numero}</strong>
                        <small>{cotizacion.tipo_comprador === 'registrado' ? 'Cliente registrado' : 'Comprador ocasional'}</small>
                      </td>
                      <td data-label="Fecha">{mostrarFecha(cotizacion.fecha_creacion)}</td>
                      <td data-label="Cliente">
                        <strong>{cotizacion.comprador_nombre}</strong>
                        <small>NIT {cotizacion.comprador_nit}</small>
                      </td>
                      <td data-label="Serie / usuario">
                        <strong>{cotizacion.serie_usuario_snapshot}</strong>
                        <small>{cotizacion.usuario_creador?.nombre_completo ?? '—'}</small>
                      </td>
                      <td data-label="Total">
                        <strong>{formatoMoneda.format(Number(cotizacion.total))}</strong>
                      </td>
                      <td data-label="Estado">
                        <EstadoEtiqueta
                          tono={tonosEstado[cotizacion.estado] ?? 'neutro'}
                        >
                          {etiquetasEstado[cotizacion.estado] ?? cotizacion.estado}
                        </EstadoEtiqueta>
                      </td>
                      <td data-label="Acciones">
                        <div className="acciones-fila-cotizaciones">
                          <button
                            className="boton-secundario-cotizaciones"
                            type="button"
                            onClick={() => abrirDetalle(cotizacion.id)}
                          >
                            Ver
                          </button>
                          {puedeEditar && cotizacion.estado === 'borrador' && (
                            <button
                              className="boton-texto-cotizaciones"
                              type="button"
                              onClick={() => abrirFormulario(cotizacion.id)}
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!cargando && !error && paginacion.total_paginas > 0 && (
            <nav className="paginacion-cotizaciones" aria-label="Paginación de cotizaciones">
              <button
                className="boton-secundario-cotizaciones"
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
              >
                Anterior
              </button>
              <span>
                Página {paginacion.pagina} de {paginacion.total_paginas}
              </span>
              <button
                className="boton-secundario-cotizaciones"
                type="button"
                disabled={pagina >= paginacion.total_paginas}
                onClick={() => setPagina((actual) => actual + 1)}
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>
      </section>
    </section>
  )
}

export default Cotizaciones
