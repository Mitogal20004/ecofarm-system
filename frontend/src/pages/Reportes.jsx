import { useCallback, useEffect, useMemo, useState } from 'react'
import { defineChart, lineY } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Chart } from '@tanstack/react-charts'
import IconoInterfaz from '../components/IconoInterfaz'
import {
  obtenerReporteProductosVendidos,
  obtenerReporteVentas,
} from '../services/reportes'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'
import { Eraser, Maximize2, TrendingDown, TrendingUp, X } from 'lucide-react'
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

function desplazarFecha(fechaTexto, dias) {
  const fecha = new Date(`${fechaTexto}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

function obtenerPeriodoSemanaActual() {
  const fechaHasta = obtenerFechaGuatemala()
  const fecha = new Date(`${fechaHasta}T00:00:00Z`)
  const dia = fecha.getUTCDay()
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1
  const fechaDesde = desplazarFecha(fechaHasta, -diasDesdeLunes)

  return { fecha_desde: fechaDesde, fecha_hasta: desplazarFecha(fechaDesde, 6) }
}

function obtenerPeriodoGrafica(tipo) {
  const fechaHasta = obtenerFechaGuatemala()
  if (tipo === 'dia') return { fecha_desde: fechaHasta, fecha_hasta: fechaHasta }
  if (tipo === 'mes') {
    return { fecha_desde: `${fechaHasta.slice(0, 7)}-01`, fecha_hasta: fechaHasta }
  }
  return obtenerPeriodoSemanaActual()
}

const PERIODO_INICIAL = obtenerPeriodoInicial()
const PERIODO_SEMANA_ACTUAL = obtenerPeriodoSemanaActual()

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

function TarjetaResumen({ icono, iconoAlterno: IconoAlterno, etiqueta, valor, detalle, tono = 'petroleo' }) {
  return (
    <article className={`tarjeta-resumen-reporte tarjeta-resumen-${tono}`}>
      <div className="cabecera-resumen-reporte">
          <span className="icono-resumen-reporte" aria-hidden="true">
            {IconoAlterno ? <IconoAlterno /> : <IconoInterfaz nombre={icono} />}
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

function FiltrosPeriodo({ valores, alCambiar, alLimpiar }) {
  return (
    <div className="filtros-reportes">
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
          <Eraser size={15} strokeWidth={2.1} aria-hidden="true" />
          Limpiar filtros
        </button>
      </div>
    </div>
  )
}

function GraficaVentas({ serie, sinEncabezado = false }) {
  const [graficaAmpliada, setGraficaAmpliada] = useState(false)
  const datosGrafica = useMemo(
    () => serie.map((punto) => ({
      fecha: formatearFecha(punto.fecha).slice(0, 5),
      confirmadas: Number(punto.operaciones_confirmadas) || 0,
      anuladas: Number(punto.operaciones_anuladas) || 0,
      productos: Array.isArray(punto.productos) ? punto.productos : [],
    })),
    [serie],
  )
  const maximoEje = Math.max(
    1,
    Math.ceil(
      Math.max(
        ...datosGrafica.flatMap((punto) => [punto.confirmadas, punto.anuladas]),
        0,
      ) * 1.2,
    ),
  )
  const definicionGrafica = useMemo(
    () => defineChart({
      marks: [
        lineY(datosGrafica, { x: 'fecha', y: 'confirmadas', color: '#2583df' }),
        lineY(datosGrafica, { x: 'fecha', y: 'anuladas', color: '#9b51e0' }),
      ],
      scales: {
        x: { scale: () => scaleBand().padding(0.2) },
        y: {
          scale: scaleLinear,
          domain: [0, maximoEje],
          nice: true,
          grid: true,
          axis: { label: 'Cantidad de ventas' },
        },
      },
      tooltip: {
        use: tooltip,
        formatGroup(points) {
          const punto = datosGrafica.find(
            (dato) => dato.fecha === String(points[0]?.xValue ?? ''),
          )
          const productos = punto?.productos?.length
            ? punto.productos
                .map(
                  (producto) =>
                    `${producto.nombre} (${producto.sku}) · ${producto.presentacion}: ${formatearCantidad(producto.cantidad)}`,
                )
                .join('\n')
            : 'Sin productos confirmados'

          return [
            String(points[0]?.xValue ?? 'Fecha seleccionada'),
            ...points.map(
              (point) => `${point.groupLabel}: ${formatearCantidad(point.yValue)} ventas`,
            ),
            'Productos vendidos:',
            productos,
          ].join('\n')
        },
      },
      svgAnimation: true,
    }),
    [datosGrafica, maximoEje],
  )

  useEffect(() => {
    if (!graficaAmpliada) return undefined

    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape') setGraficaAmpliada(false)
    }

    document.addEventListener('keydown', cerrarConEscape)
    const overflowOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', cerrarConEscape)
      document.body.style.overflow = overflowOriginal
    }
  }, [graficaAmpliada])

  const renderizarGrafica = (altura, anchoInicial) => (
    <Chart
      definition={definicionGrafica}
      height={altura}
      initialWidth={anchoInicial}
      ariaLabel="Ventas confirmadas y anuladas por día"
      ariaDescription="Gráfica de operaciones confirmadas y anuladas agrupadas por fecha."
    />
  )

  return (
    <section className="panel-reporte" aria-labelledby="titulo-grafica-ventas">
      <div className={`encabezado-panel-reporte ${sinEncabezado ? 'encabezado-grafica-oculto' : ''}`}>
          {!sinEncabezado && <h2 id="titulo-grafica-ventas">Ventas confirmadas y anuladas</h2>}
          <div className="acciones-grafica-reportes">
            {!sinEncabezado && (
              <div className="leyenda-grafica-reportes" aria-label="Leyenda de la gráfica">
                <span><i className="indicador-leyenda-reportes indicador-confirmadas-reportes" />Confirmadas</span>
                <span><i className="indicador-leyenda-reportes indicador-anuladas-reportes" />Anuladas</span>
              </div>
            )}
            <button
              className="boton-icono-reporte"
              type="button"
              onClick={() => setGraficaAmpliada(true)}
              aria-label="Ampliar gráfica de ventas"
              title="Ampliar gráfica"
            >
              <Maximize2 size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
      </div>
      <div className="grafica-chart-reportes">
        {renderizarGrafica(300, 720)}
      </div>
      {graficaAmpliada && (
        <div
          className="capa-grafica-reportes"
          role="presentation"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setGraficaAmpliada(false)
          }}
        >
          <section
            className="modal-grafica-reportes"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-grafica-ampliada"
          >
            <div className="encabezado-modal-grafica-reportes">
              <h2 id="titulo-grafica-ampliada">Ventas confirmadas y anuladas</h2>
              <button
                className="boton-icono-reporte"
                type="button"
                onClick={() => setGraficaAmpliada(false)}
                aria-label="Cerrar gráfica ampliada"
                title="Cerrar"
              >
                <X size={20} strokeWidth={2.1} aria-hidden="true" />
              </button>
            </div>
            <div className="leyenda-grafica-reportes leyenda-modal-grafica-reportes" aria-label="Leyenda de la gráfica">
              <span><i className="indicador-leyenda-reportes indicador-confirmadas-reportes" />Confirmadas</span>
              <span><i className="indicador-leyenda-reportes indicador-anuladas-reportes" />Anuladas</span>
            </div>
            <div className="grafica-chart-reportes grafica-chart-ampliada-reportes">
              {renderizarGrafica(520, 1200)}
            </div>
          </section>
        </div>
      )}
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
            iconoAlterno={Number(resumen?.operaciones_confirmadas) > 0 ? TrendingUp : TrendingDown}
            etiqueta="Ventas confirmadas"
            valor={formatearCantidad(resumen?.operaciones_confirmadas)}
            tono={Number(resumen?.operaciones_confirmadas) > 0 ? 'verde' : 'critico'}
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

function GraficaTemporal({ consulta, periodo, alCambiarPeriodo }) {
  const serie = consulta.datos?.serie ?? []
  const filtros = [
    ['dia', 'Día'],
    ['semana', 'Semana'],
    ['mes', 'Mes'],
  ]

  return (
    <section className="panel-reporte grafica-temporal-reportes" aria-labelledby="titulo-grafica-temporal">
      <div className="encabezado-panel-reporte encabezado-grafica-temporal">
        <h2 id="titulo-grafica-temporal">Ventas confirmadas y anuladas</h2>
        <div className="acciones-grafica-reportes">
          <div className="leyenda-grafica-reportes" aria-label="Leyenda de la gráfica">
            <span><i className="indicador-leyenda-reportes indicador-confirmadas-reportes" />Confirmadas</span>
            <span><i className="indicador-leyenda-reportes indicador-anuladas-reportes" />Anuladas</span>
          </div>
          <div className="filtros-grafica-temporal" role="group" aria-label="Período de la gráfica">
            {filtros.map(([valor, etiqueta]) => (
              <button
                key={valor}
                className={periodo === valor ? 'activo' : ''}
                type="button"
                aria-pressed={periodo === valor}
                onClick={() => alCambiarPeriodo(valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>
      <EstadoConsulta
        cargando={consulta.cargando}
        error={consulta.error}
        vacio={!consulta.datos || serie.length === 0}
        mensajeVacio="No hay ventas registradas en este período."
      >
        <GraficaVentas serie={serie} sinEncabezado />
      </EstadoConsulta>
    </section>
  )
}

function Reportes({ alRefrescarAutorizacion }) {
  const [filtros, setFiltros] = useState(PERIODO_INICIAL)
  const [periodoAplicado, setPeriodoAplicado] = useState(PERIODO_INICIAL)
  const [periodoGrafica, setPeriodoGrafica] = useState('semana')
  const [periodoGraficaAplicado, setPeriodoGraficaAplicado] = useState(
    PERIODO_SEMANA_ACTUAL,
  )

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
  const consultarGrafica = useCallback(
    (signal) => obtenerReporteVentas(periodoGraficaAplicado, { signal }),
    [periodoGraficaAplicado],
  )

  const consultaVentas = useConsultaReporte(
    consultarVentas,
    alRefrescarAutorizacion,
  )
  const consultaProductos = useConsultaReporte(
    consultarProductos,
    alRefrescarAutorizacion,
  )
  const consultaGrafica = useConsultaReporte(
    consultarGrafica,
    alRefrescarAutorizacion,
  )

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setPeriodoGraficaAplicado(obtenerPeriodoGrafica(periodoGrafica))
    }, 350)

    return () => window.clearTimeout(temporizador)
  }, [periodoGrafica])

  const limpiarFiltros = () => {
    setFiltros(PERIODO_INICIAL)
    setPeriodoAplicado(PERIODO_INICIAL)
  }

  return (
    <div className="pagina-reportes">
      <header className="encabezado-reportes">
        <h1>Reportes</h1>
        {consultaVentas.datos?.resumen && (() => {
          const tieneVentas = Number(consultaVentas.datos.resumen.operaciones_confirmadas) > 0
          const IconoTendencia = tieneVentas ? TrendingUp : TrendingDown
          return (
            <span
              className={`indicador-tendencia-reportes ${tieneVentas ? 'positivo' : 'negativo'}`}
              title={tieneVentas ? 'Hay ventas confirmadas' : 'No hay ventas confirmadas'}
              aria-label={tieneVentas ? 'Hay ventas confirmadas' : 'No hay ventas confirmadas'}
            >
              <IconoTendencia size={24} strokeWidth={2.3} aria-hidden="true" />
            </span>
          )
        })()}
      </header>

      <FiltrosPeriodo
        valores={filtros}
        alCambiar={(campo, valor) => {
          const siguientes = { ...filtros, [campo]: valor }
          setFiltros(siguientes)
          if (
            siguientes.fecha_desde &&
            siguientes.fecha_hasta &&
            siguientes.fecha_desde <= siguientes.fecha_hasta
          ) {
            setPeriodoAplicado(siguientes)
          }
        }}
        alLimpiar={limpiarFiltros}
      />

      <GraficaTemporal
        consulta={consultaGrafica}
        periodo={periodoGrafica}
        alCambiarPeriodo={setPeriodoGrafica}
      />
      <ResumenVentas consulta={consultaVentas} />
      <ProductosMasVendidos consulta={consultaProductos} />
    </div>
  )
}

export default Reportes
