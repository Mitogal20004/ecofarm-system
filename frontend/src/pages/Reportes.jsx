import { useCallback, useEffect, useState } from 'react'
import IconoInterfaz from '../components/IconoInterfaz'
import {
  obtenerReporteProductosVendidos,
  obtenerReporteVentas,
} from '../services/reportes'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'
import './Reportes.css'

const LIMITE_PRODUCTOS = 5
const ZONA_HORARIA = 'America/Guatemala'

const nombresClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

function obtenerFechaGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const valor = Object.fromEntries(
    partes.map((parte) => [parte.type, parte.value]),
  )
  return `${valor.year}-${valor.month}-${valor.day}`
}

function obtenerPeriodoInicial() {
  const fechaHasta = obtenerFechaGuatemala()
  return {
    fecha_desde: `${fechaHasta.slice(0, 7)}-01`,
    fecha_hasta: fechaHasta,
  }
}

const PERIODO_INICIAL = obtenerPeriodoInicial()

function agruparEntero(valor) {
  const texto = String(valor ?? '0')
  const signo = texto.startsWith('-') ? '-' : ''
  const entero = signo ? texto.slice(1) : texto
  return `${signo}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function formatearCantidad(valor) {
  const texto = String(valor ?? '0')
  if (!/^-?\d+$/.test(texto)) return texto
  return agruparEntero(texto)
}

function formatearMoneda(valor) {
  const texto = String(valor ?? '0').trim()
  const coincidencia = texto.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!coincidencia) return `Q ${texto}`

  const [, signo, entero, decimales = ''] = coincidencia
  const fraccion = decimales.padEnd(2, '0')
  return `${signo}Q ${agruparEntero(entero)}.${fraccion}`
}

function formatearFecha(fecha) {
  if (typeof fecha !== 'string') return '—'
  const coincidencia = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!coincidencia) return fecha
  return `${coincidencia[3]}/${coincidencia[2]}/${coincidencia[1]}`
}

function obtenerMensajeError(error) {
  if (error?.status === 403) return 'No tienes permiso para consultar reportes.'
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  if (error?.status === 400) return 'Revisa las fechas proporcionadas.'
  return error?.message || 'No fue posible cargar el reporte.'
}

function useConsultaReporte(consultar, alRefrescarAutorizacion) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controlador = new AbortController()
    let vigente = true
    const inicioConsulta = window.setTimeout(() => {
      setCargando(true)
      setError('')
      setDatos(null)

      consultar(controlador.signal)
        .then((resultado) => {
          if (vigente) setDatos(resultado)
        })
        .catch((errorConsulta) => {
          if (!vigente || errorConsulta?.name === 'AbortError') return
          setError(obtenerMensajeError(errorConsulta))
          if ([401, 403].includes(errorConsulta?.status)) {
            alRefrescarAutorizacion?.()
          }
        })
        .finally(() => {
          if (vigente) setCargando(false)
        })
    }, 0)

    return () => {
      vigente = false
      window.clearTimeout(inicioConsulta)
      controlador.abort()
    }
  }, [alRefrescarAutorizacion, consultar])

  return { datos, cargando, error }
}

function TarjetaResumen({ icono, etiqueta, valor, detalle, tono = 'petroleo' }) {
  return (
    <article className={`tarjeta-resumen-reporte tarjeta-resumen-${tono}`}>
      <div className="cabecera-resumen-reporte">
        <span className="icono-resumen-reporte" aria-hidden="true">
          <IconoInterfaz nombre={icono} />
        </span>
        <span>{etiqueta}</span>
      </div>
      <strong>{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </article>
  )
}

function EstadoConsulta({ cargando, error, vacio, mensajeVacio, children }) {
  if (cargando) {
    return (
      <div className="estado-reporte" role="status" aria-live="polite">
        <span className="cargador-reporte" aria-hidden="true" />
        Consultando información...
      </div>
    )
  }

  if (error) {
    return (
      <p className="estado-reporte estado-error-reporte" role="alert">
        {error}
      </p>
    )
  }

  if (vacio) return <p className="estado-reporte">{mensajeVacio}</p>
  return children
}

function FiltrosPeriodo({ valores, alCambiar, alAplicar, alLimpiar }) {
  return (
    <form className="filtros-reportes" onSubmit={alAplicar}>
      <label className="control-reporte">
        <span>Desde</span>
        <input
          type="date"
          value={valores.fecha_desde}
          max={valores.fecha_hasta}
          onChange={(evento) => alCambiar('fecha_desde', evento.target.value)}
          required
        />
      </label>
      <label className="control-reporte">
        <span>Hasta</span>
        <input
          type="date"
          value={valores.fecha_hasta}
          min={valores.fecha_desde}
          onChange={(evento) => alCambiar('fecha_hasta', evento.target.value)}
          required
        />
      </label>
      <div className="acciones-filtros-reportes">
        <button
          className="boton-secundario-reporte"
          type="button"
          onClick={alLimpiar}
        >
          Limpiar filtros
        </button>
        <button className="boton-primario-reporte" type="submit">
          Aplicar filtros
        </button>
      </div>
    </form>
  )
}

function GraficaVentas({ serie }) {
  const maximo = Math.max(
    1,
    ...serie.map((punto) => Number(punto.operaciones_confirmadas) || 0),
  )

  return (
    <section className="panel-reporte" aria-labelledby="titulo-grafica-ventas">
      <div className="encabezado-panel-reporte">
        <h2 id="titulo-grafica-ventas">Ventas confirmadas por día</h2>
      </div>
      <div
        className="grafica-columnas-reportes"
        role="img"
        aria-label="Ventas confirmadas por día"
      >
        {serie.map((punto) => {
          const cantidad = Number(punto.operaciones_confirmadas) || 0
          const altura =
            cantidad === 0 ? 0 : Math.max(7, (cantidad / maximo) * 100)

          return (
            <div className="columna-grafica-reporte" key={punto.fecha}>
              <span>{formatearCantidad(punto.operaciones_confirmadas)}</span>
              <div className="riel-columna-reporte">
                <i style={{ height: `${altura}%` }} />
              </div>
              <small>{formatearFecha(punto.fecha).slice(0, 5)}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ResumenVentas({ consulta }) {
  const resumen = consulta.datos?.resumen
  const serie = consulta.datos?.serie ?? []

  return (
    <EstadoConsulta
      cargando={consulta.cargando}
      error={consulta.error}
      vacio={!resumen}
      mensajeVacio="No hay información de ventas para el período seleccionado."
    >
      <>
        <section
          className="cuadricula-kpi-reportes"
          aria-label="Resumen de ventas"
        >
          <TarjetaResumen
            icono="ventas"
            etiqueta="Ingresos válidos"
            valor={formatearMoneda(resumen?.ingresos_validos)}
            detalle="Solo ventas confirmadas"
          />
          <TarjetaResumen
            icono="disponible"
            etiqueta="Ventas confirmadas"
            valor={formatearCantidad(resumen?.operaciones_confirmadas)}
            tono="verde"
          />
          <TarjetaResumen
            icono="agotado"
            etiqueta="Ventas anuladas"
            valor={formatearCantidad(resumen?.operaciones_anuladas)}
            tono="critico"
          />
          <TarjetaResumen
            icono="capas"
            etiqueta="Operaciones registradas"
            valor={formatearCantidad(resumen?.operaciones_registradas)}
          />
          <TarjetaResumen
            icono="advertencia"
            etiqueta="Monto anulado"
            valor={formatearMoneda(resumen?.monto_anulado)}
            tono="oliva"
          />
        </section>

        {serie.length > 0 ? (
          <>
            <GraficaVentas serie={serie} />
            <section
              className="panel-reporte"
              aria-labelledby="titulo-serie-ventas"
            >
              <div className="encabezado-panel-reporte">
                <h2 id="titulo-serie-ventas">Detalle diario</h2>
              </div>
              <div className="desplazamiento-tabla-reportes">
                <table className="tabla-reportes tabla-serie-ventas">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Registradas</th>
                      <th>Confirmadas</th>
                      <th>Anuladas</th>
                      <th>Ingresos válidos</th>
                      <th>Monto anulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serie.map((fila) => (
                      <tr key={fila.fecha}>
                        <td>{formatearFecha(fila.fecha)}</td>
                        <td>{formatearCantidad(fila.operaciones_registradas)}</td>
                        <td>{formatearCantidad(fila.operaciones_confirmadas)}</td>
                        <td>{formatearCantidad(fila.operaciones_anuladas)}</td>
                        <td>{formatearMoneda(fila.ingresos_validos)}</td>
                        <td>{formatearMoneda(fila.monto_anulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <p className="estado-reporte">No hay ventas diarias en este período.</p>
        )}
      </>
    </EstadoConsulta>
  )
}

function ProductosMasVendidos({ consulta }) {
  const productos = consulta.datos?.productos ?? []

  return (
    <section className="panel-reporte" aria-labelledby="titulo-productos-vendidos">
      <div className="encabezado-panel-reporte">
        <h2 id="titulo-productos-vendidos">Productos más vendidos</h2>
      </div>
      <EstadoConsulta
        cargando={consulta.cargando}
        error={consulta.error}
        vacio={productos.length === 0}
        mensajeVacio="No hay productos vendidos en el período seleccionado."
      >
        <div className="desplazamiento-tabla-reportes">
          <table className="tabla-reportes tabla-productos-reportes">
            <thead>
              <tr>
                <th>Ranking</th>
                <th>Producto / variante</th>
                <th>Presentación</th>
                <th>Unidades</th>
                <th>Manojos</th>
                <th>Importe vendido</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto, indice) => (
                <tr key={`${producto.variante_id}-${producto.presentacion_id}`}>
                  <td>
                    <span className="ranking-reporte">#{indice + 1}</span>
                  </td>
                  <td>
                    <strong>{producto.codigo_sku}</strong>
                    <small>
                      {producto.color} · {producto.longitud_cm} cm ·{' '}
                      {nombresClasificacion[producto.clasificacion] ??
                        producto.clasificacion}
                    </small>
                  </td>
                  <td>
                    <strong>{producto.presentacion_nombre}</strong>
                    <small>
                      {formatearManojosPorUnidad(
                        producto.cantidad_manojos_presentacion,
                      )}
                    </small>
                  </td>
                  <td>{formatearCantidad(producto.unidades_comerciales)}</td>
                  <td>{formatearCantidad(producto.manojos_equivalentes)}</td>
                  <td>
                    <strong>{formatearMoneda(producto.importe_vendido)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoConsulta>
    </section>
  )
}

function Reportes({ alRefrescarAutorizacion }) {
  const [filtros, setFiltros] = useState(PERIODO_INICIAL)
  const [periodoAplicado, setPeriodoAplicado] = useState(PERIODO_INICIAL)

  const consultarVentas = useCallback(
    (signal) => obtenerReporteVentas(periodoAplicado, { signal }),
    [periodoAplicado],
  )
  const consultarProductos = useCallback(
    (signal) =>
      obtenerReporteProductosVendidos(
        {
          ...periodoAplicado,
          pagina: 1,
          limite: LIMITE_PRODUCTOS,
        },
        { signal },
      ),
    [periodoAplicado],
  )

  const consultaVentas = useConsultaReporte(
    consultarVentas,
    alRefrescarAutorizacion,
  )
  const consultaProductos = useConsultaReporte(
    consultarProductos,
    alRefrescarAutorizacion,
  )

  const aplicarFiltros = (evento) => {
    evento.preventDefault()
    setPeriodoAplicado({ ...filtros })
  }

  const limpiarFiltros = () => {
    setFiltros(PERIODO_INICIAL)
    setPeriodoAplicado(PERIODO_INICIAL)
  }

  return (
    <div className="pagina-reportes">
      <header className="encabezado-reportes">
        <h1>Reportes</h1>
      </header>

      <FiltrosPeriodo
        valores={filtros}
        alCambiar={(campo, valor) =>
          setFiltros((actual) => ({ ...actual, [campo]: valor }))
        }
        alAplicar={aplicarFiltros}
        alLimpiar={limpiarFiltros}
      />

      <ResumenVentas consulta={consultaVentas} />
      <ProductosMasVendidos consulta={consultaProductos} />
    </div>
  )
}

export default Reportes
