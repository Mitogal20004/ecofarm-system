import { useCallback, useEffect, useState } from 'react'
import DetalleVenta from '../components/DetalleVenta'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import VentaPos from '../components/VentaPos'
import { listarVentas } from '../services/ventas'
import './Ventas.css'

const LIMITE_VENTAS = 10
const FILTROS_INICIALES = {
  busqueda: '',
  estado: '',
  tipo_documento: '',
  fecha_desde: '',
  fecha_hasta: '',
}
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_VENTAS,
  total: 0,
  total_paginas: 0,
}
const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})
const formatoFecha = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
})

const mostrarFecha = (valor) =>
  valor ? formatoFecha.format(new Date(valor)) : '—'

const trazosAccionVenta = {
  ver: (
    <>
      <path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  anular: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  recibo: (
    <>
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Z" />
      <path d="M9 8h6m-6 4h6" />
    </>
  ),
  factura: (
    <>
      <path d="M6 3h9l3 3v15H6V3Z" />
      <path d="M15 3v4h3M9 11h6m-6 4h6" />
    </>
  ),
}

function IconoAccionVenta({ tipo }) {
  return (
    <svg
      className="icono-accion-venta"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {trazosAccionVenta[tipo]}
    </svg>
  )
}

function Ventas({
  permisos = [],
  usuarioActualId,
  ventaInicialId = null,
  alConsumirVentaInicial,
  alRefrescarAutorizacion,
}) {
  const puedeVer = permisos.includes('venta.ver')
  const puedeCrear = permisos.includes('venta.crear')
  const puedeAnular = permisos.includes('venta.anular')
  const puedeConsultarDevolucion =
    puedeVer || permisos.includes('caja.registrar_devolucion')
  const puedeRegistrarDevolucion =
    Boolean(usuarioActualId) &&
    permisos.includes('caja.registrar_devolucion') &&
    permisos.includes('caja.operar')
  const [vista, setVista] = useState(
    ventaInicialId && puedeVer ? 'detalle' : puedeCrear ? 'pos' : 'historial',
  )
  const [ventas, setVentas] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [filtrosEdicion, setFiltrosEdicion] = useState(FILTROS_INICIALES)
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [ventaId, setVentaId] = useState(ventaInicialId)
  const [documentoImpresionInicial, setDocumentoImpresionInicial] = useState(null)
  const [anularAlAbrir, setAnularAlAbrir] = useState(false)
  const [versionListado, setVersionListado] = useState(0)

  useEffect(() => {
    if (!ventaInicialId || !puedeVer) return undefined

    const temporizador = window.setTimeout(
      () => alConsumirVentaInicial?.(),
      0,
    )

    return () => window.clearTimeout(temporizador)
  }, [alConsumirVentaInicial, puedeVer, ventaInicialId])

  const cargarListado = useCallback(async () => {
    if (!puedeVer) return
    setCargando(true)
    setError('')

    try {
      const resultado = await listarVentas({
        pagina,
        limite: LIMITE_VENTAS,
        ...filtrosAplicados,
      })
      setVentas(resultado.ventas)
      setPaginacion(resultado.paginacion)
    } catch (errorCarga) {
      setVentas([])
      setPaginacion(PAGINACION_INICIAL)
      setError(errorCarga?.message || 'No fue posible cargar las ventas.')
      if ([401, 403].includes(errorCarga?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, filtrosAplicados, pagina, puedeVer])

  useEffect(() => {
    if (vista !== 'historial') return undefined
    const temporizador = window.setTimeout(cargarListado, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarListado, versionListado, vista])

  const abrirDetalle = (id, imprimir = false, anular = false) => {
    setVentaId(id)
    setDocumentoImpresionInicial(
      imprimir === true ? 'recibo' : imprimir || null,
    )
    setAnularAlAbrir(anular)
    setVista('detalle')
  }

  const volverDesdeDetalle = () => {
    setVentaId(null)
    setDocumentoImpresionInicial(null)
    setAnularAlAbrir(false)
    setVista(puedeVer ? 'historial' : 'pos')
  }

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

  if (vista === 'detalle' && ventaId) {
    return (
      <DetalleVenta
        key={`${usuarioActualId}-${ventaId}-${documentoImpresionInicial}-${anularAlAbrir}`}
        ventaId={ventaId}
        puedeAnular={puedeAnular}
        puedeCrear={puedeCrear}
        puedeConsultarDevolucion={puedeConsultarDevolucion}
        puedeRegistrarDevolucion={puedeRegistrarDevolucion}
        usuarioActualId={usuarioActualId}
        documentoImpresionInicial={documentoImpresionInicial}
        anularAlAbrir={anularAlAbrir}
        alVolver={volverDesdeDetalle}
        alActualizar={() => setVersionListado((version) => version + 1)}
        alRefrescarAutorizacion={alRefrescarAutorizacion}
      />
    )
  }

  return (
    <section className="pagina-ventas" aria-labelledby="titulo-ventas">
      <header className="encabezado-ventas">
        <h1 id="titulo-ventas">Ventas</h1>
        <div className="acciones-encabezado-ventas">
          {puedeVer && (
            <button
              className={vista === 'historial' ? 'boton-primario-ventas' : 'boton-secundario-ventas'}
              type="button"
              onClick={() => setVista('historial')}
              aria-pressed={vista === 'historial'}
            >
              Historial
            </button>
          )}
          {puedeCrear && (
            <button
              className={vista === 'pos' ? 'boton-primario-ventas' : 'boton-secundario-ventas'}
              type="button"
              onClick={() => setVista('pos')}
              aria-pressed={vista === 'pos'}
            >
              Nueva venta
            </button>
          )}
        </div>
      </header>

      {vista === 'pos' && puedeCrear ? (
        <VentaPos
          alVerVenta={abrirDetalle}
          puedeVer={puedeVer}
          alRefrescarAutorizacion={alRefrescarAutorizacion}
        />
      ) : (
        <>
          <form className="filtros-ventas" onSubmit={aplicarFiltros}>
            <div className="encabezado-filtros-ventas">
              <strong>Buscar ventas</strong>
              <button className="boton-limpiar-ventas" type="button" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            </div>
            <div className="campo-ventas campo-busqueda-ventas">
              <label htmlFor="busqueda-ventas">Búsqueda</label>
              <input
                id="busqueda-ventas"
                name="busqueda"
                value={filtrosEdicion.busqueda}
                onChange={actualizarFiltro}
                maxLength={200}
                placeholder="Venta, recibo, comprador, NIT o serie"
              />
            </div>
            <div className="campo-ventas">
              <label htmlFor="estado-ventas">Estado</label>
              <select id="estado-ventas" name="estado" value={filtrosEdicion.estado} onChange={actualizarFiltro}>
                <option value="">Todos</option>
                <option value="confirmada">Confirmada</option>
                <option value="anulada">Anulada</option>
              </select>
            </div>
            <div className="campo-ventas">
              <label htmlFor="documento-ventas">Documento</label>
              <select id="documento-ventas" name="tipo_documento" value={filtrosEdicion.tipo_documento} onChange={actualizarFiltro}>
                <option value="">Todos</option>
                <option value="recibo">Con recibo</option>
                <option value="sin_documento">Sin documento</option>
              </select>
            </div>
            <div className="campo-ventas">
              <label htmlFor="fecha-desde-ventas">Desde</label>
              <input id="fecha-desde-ventas" name="fecha_desde" type="date" value={filtrosEdicion.fecha_desde} onChange={actualizarFiltro} />
            </div>
            <div className="campo-ventas">
              <label htmlFor="fecha-hasta-ventas">Hasta</label>
              <input id="fecha-hasta-ventas" name="fecha_hasta" type="date" value={filtrosEdicion.fecha_hasta} onChange={actualizarFiltro} />
            </div>
            <button className="boton-primario-ventas boton-buscar-ventas" type="submit">Buscar</button>
          </form>

          <section className="seccion-historial-ventas" aria-labelledby="historial-ventas">
            <div className="encabezado-historial-ventas">
              <div>
                <h2 id="historial-ventas">Historial de ventas</h2>
                <p>{paginacion.total} documentos encontrados</p>
              </div>
            </div>
            <div className="contenedor-tabla-ventas">
              {cargando ? (
                <p className="estado-ventas" aria-live="polite">Cargando ventas...</p>
              ) : error ? (
                <p className="estado-ventas estado-error-ventas" role="alert">{error}</p>
              ) : ventas.length === 0 ? (
                <p className="estado-ventas">No se encontraron ventas.</p>
              ) : (
                <div className="desplazamiento-tabla-ventas">
                  <table className="tabla-ventas">
                    <thead>
                      <tr>
                        <th scope="col">Venta</th>
                        <th scope="col">Recibo</th>
                        <th scope="col">Fecha</th>
                        <th scope="col">Cliente</th>
                        <th scope="col">Serie / usuario</th>
                        <th scope="col">Total</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((venta) => (
                        <tr key={venta.id}>
                          <td data-label="Venta">
                            <strong className="numero-venta">{venta.numero}</strong>
                            <small>{venta.origen === 'cotizacion' ? 'Desde cotización' : 'Venta directa'}</small>
                          </td>
                          <td data-label="Recibo">{venta.recibo ? <><strong>{venta.recibo.numero}</strong><small>{mostrarFecha(venta.recibo.fecha_emision)}</small></> : <span className="sin-documento-venta">Sin recibo</span>}</td>
                          <td data-label="Fecha">{mostrarFecha(venta.fecha_confirmacion)}</td>
                          <td data-label="Cliente"><strong>{venta.comprador_nombre}</strong><small>NIT {venta.comprador_nit}</small></td>
                          <td data-label="Serie / usuario"><strong>{venta.serie_usuario_snapshot}</strong><small>{venta.usuario_creador?.nombre_completo ?? '—'}</small></td>
                          <td data-label="Total"><strong>{formatoMoneda.format(Number(venta.total))}</strong></td>
                          <td data-label="Estado"><EstadoEtiqueta tono={venta.estado === 'confirmada' ? 'positivo' : 'peligro'}>{venta.estado === 'confirmada' ? 'Confirmada' : 'Anulada'}</EstadoEtiqueta></td>
                          <td data-label="Acciones">
                            <div className="acciones-fila-ventas">
                              <button
                                className="boton-secundario-ventas accion-ver-venta"
                                type="button"
                                onClick={() => abrirDetalle(venta.id)}
                              >
                                <IconoAccionVenta tipo="ver" />
                                <span>Ver detalle</span>
                              </button>
                              {puedeAnular && venta.estado === 'confirmada' && (
                                <button
                                  className="boton-texto-peligro-ventas accion-anular-venta"
                                  type="button"
                                  onClick={() => abrirDetalle(venta.id, false, true)}
                                >
                                  <IconoAccionVenta tipo="anular" />
                                  <span>Anular</span>
                                </button>
                              )}
                              {venta.recibo && (
                                <button
                                  className="boton-documento-ventas boton-recibo-ventas accion-recibo-venta"
                                  type="button"
                                  onClick={() => abrirDetalle(venta.id, true)}
                                >
                                  <IconoAccionVenta tipo="recibo" />
                                  <span>Imprimir recibo</span>
                                </button>
                              )}
                              <button
                                className="boton-documento-ventas boton-factura-ventas accion-factura-venta"
                                type="button"
                                onClick={() => abrirDetalle(venta.id, 'factura-demostracion')}
                              >
                                <IconoAccionVenta tipo="factura" />
                                <span>Imprimir factura</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!cargando && !error && paginacion.total_paginas > 0 && (
                <nav className="paginacion-ventas" aria-label="Paginación de ventas">
                  <button className="boton-secundario-ventas" type="button" disabled={pagina <= 1} onClick={() => setPagina((actual) => Math.max(1, actual - 1))}>Anterior</button>
                  <span>Página {paginacion.pagina} de {paginacion.total_paginas}</span>
                  <button className="boton-secundario-ventas" type="button" disabled={pagina >= paginacion.total_paginas} onClick={() => setPagina((actual) => actual + 1)}>Siguiente</button>
                </nav>
              )}
            </div>
          </section>
        </>
      )}

    </section>
  )
}

export default Ventas
