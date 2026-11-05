import { useEffect, useState } from 'react'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import { obtenerCajaActual } from '../services/caja'
import { listarInventario } from '../services/inventario'
import { obtenerReporteVentas } from '../services/reportes'
import { listarVentas } from '../services/ventas'
import './Inicio.css'

const ZONA_HORARIA = 'America/Guatemala'
const ESTADO_INICIAL = { cargando: false, datos: null, error: '' }

function obtenerFechaGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const valores = Object.fromEntries(
    partes.map((parte) => [parte.type, parte.value]),
  )
  return `${valores.year}-${valores.month}-${valores.day}`
}

function agruparEntero(valor) {
  const texto = String(valor ?? '0')
  const signo = texto.startsWith('-') ? '-' : ''
  const entero = signo ? texto.slice(1) : texto
  return `${signo}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function formatearCantidad(valor) {
  const texto = String(valor ?? '').trim()
  return /^-?\d+$/.test(texto) ? agruparEntero(texto) : '—'
}

function formatearMoneda(valor) {
  const texto = String(valor ?? '').trim()
  const coincidencia = texto.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!coincidencia) return '—'
  const [, signo, entero, decimales = ''] = coincidencia
  return `${signo}Q ${agruparEntero(entero)}.${decimales.padEnd(2, '0').slice(0, 2)}`
}

function formatearFechaHora(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha)
}

function obtenerMensajeError(error, recurso) {
  if (error?.status === 401) return 'La sesión ya no es válida.'
  if (error?.status === 403) return 'No tienes permiso para consultar estos datos.'
  return `No fue posible consultar ${recurso}.`
}

function IndicadorInicio({ etiqueta, valor, detalle, estado, tono }) {
  return (
    <article
      className={`indicador-inicio indicador-inicio-${tono}`}
      aria-busy={estado.cargando}
    >
      <div className="cabecera-indicador-inicio">
        <span>{etiqueta}</span>
      </div>
      {estado.cargando ? (
        <span className="carga-indicador-inicio" role="status">
          Consultando...
        </span>
      ) : estado.error ? (
        <span className="error-indicador-inicio" role="alert">
          {estado.error}
        </span>
      ) : (
        <>
          <strong>{valor}</strong>
          {detalle && <small>{detalle}</small>}
        </>
      )}
    </article>
  )
}

function Inicio({
  permisos = [],
  errorSesion = '',
  errorAutorizacion = '',
  alRefrescarAutorizacion,
}) {
  const puedeVerReportes = permisos.includes('reporte.ver')
  const puedeConsultarCaja =
    permisos.includes('caja.operar') || permisos.includes('caja.ver')
  const puedeVerInventario = permisos.includes('inventario.ver')
  const puedeVerVentas = permisos.includes('venta.ver')
  const [ventasDia, setVentasDia] = useState(ESTADO_INICIAL)
  const [cajaActual, setCajaActual] = useState(ESTADO_INICIAL)
  const [inventario, setInventario] = useState(ESTADO_INICIAL)
  const [actividad, setActividad] = useState(ESTADO_INICIAL)

  useEffect(() => {
    const controlador = new AbortController()
    let vigente = true
    let autorizacionRefrescada = false

    const refrescarSiCorresponde = (error) => {
      if (!autorizacionRefrescada && [401, 403].includes(error?.status)) {
        autorizacionRefrescada = true
        alRefrescarAutorizacion?.()
      }
    }

    const cargar = async (
      permitido,
      consultar,
      actualizar,
      recurso,
      cancelable = true,
    ) => {
      if (!permitido) {
        actualizar(ESTADO_INICIAL)
        return
      }
      actualizar({ ...ESTADO_INICIAL, cargando: true })
      try {
        const datos = await consultar()
        if (vigente) actualizar({ cargando: false, datos, error: '' })
      } catch (error) {
        if (!vigente || (cancelable && error?.name === 'AbortError')) return
        actualizar({
          cargando: false,
          datos: null,
          error: obtenerMensajeError(error, recurso),
        })
        refrescarSiCorresponde(error)
      }
    }

    const fecha = obtenerFechaGuatemala()
    cargar(
      puedeVerReportes,
      () =>
        obtenerReporteVentas(
          { fecha_desde: fecha, fecha_hasta: fecha },
          { signal: controlador.signal },
        ).then((resultado) => resultado.resumen),
      setVentasDia,
      'las ventas de hoy',
    )
    cargar(
      puedeConsultarCaja,
      () => obtenerCajaActual({ signal: controlador.signal }),
      setCajaActual,
      'la caja actual',
    )
    cargar(
      puedeVerInventario,
      () =>
        listarInventario({ pagina: 1, limite: 1 }).then(
          (resultado) => resultado.resumen,
        ),
      setInventario,
      'el inventario',
      false,
    )
    cargar(
      puedeVerVentas,
      () =>
        listarVentas({ pagina: 1, limite: 5 }).then(
          (resultado) => resultado.ventas,
        ),
      setActividad,
      'la actividad reciente',
      false,
    )

    return () => {
      vigente = false
      controlador.abort()
    }
  }, [
    alRefrescarAutorizacion,
    puedeConsultarCaja,
    puedeVerInventario,
    puedeVerReportes,
    puedeVerVentas,
  ])

  const cajaAbierta = cajaActual.datos?.caja?.estado === 'abierta'
  const resumenCaja = cajaActual.datos?.resumen
  const hayIndicadores =
    puedeVerReportes || puedeConsultarCaja || puedeVerInventario

  return (
    <div className="inicio-panel">
      <section
        className="encabezado-panel inicio-bienvenida"
        aria-labelledby="titulo-panel"
      >
        <div>
          <p className="etiqueta-seccion">E-farm / Operación diaria</p>
          <h1 id="titulo-panel">Resumen de operaciones</h1>
          <p className="descripcion-panel">
            Ventas, caja e inventario en un solo lugar.
          </p>
        </div>
        <div className="estado-inicio" aria-label="Estado de la sesión">
          <span aria-hidden="true" />
          Sesión activa
        </div>
      </section>

      {errorSesion && <p className="mensaje-error-sesion" role="alert">{errorSesion}</p>}
      {errorAutorizacion && <p className="mensaje-error-sesion" role="alert">{errorAutorizacion}</p>}

      {hayIndicadores ? (
        <section className="seccion-resumen-inicio" aria-labelledby="titulo-resumen-inicio">
          <div className="encabezado-resumen-inicio">
            <p className="etiqueta-seccion">Hoy</p>
            <h2 id="titulo-resumen-inicio">Indicadores del día</h2>
          </div>
          <div className="cuadricula-indicadores-inicio">
            {puedeVerReportes && (
              <>
                <IndicadorInicio etiqueta="Ventas totales del día" valor={formatearMoneda(ventasDia.datos?.ingresos_validos)} detalle="Solo ventas confirmadas" estado={ventasDia} tono="petroleo" />
                <IndicadorInicio etiqueta="Cantidad de ventas del día" valor={formatearCantidad(ventasDia.datos?.operaciones_confirmadas)} detalle="Operaciones confirmadas" estado={ventasDia} tono="verde" />
              </>
            )}
            {puedeConsultarCaja && (
              <IndicadorInicio
               
                etiqueta="Caja actual"
                valor={cajaAbierta ? 'Abierta' : 'Sin turno abierto'}
                detalle={cajaAbierta ? `Efectivo esperado: ${formatearMoneda(resumenCaja?.efectivo_esperado)}` : 'No hay una caja abierta para este usuario'}
                estado={cajaActual}
                tono={cajaAbierta ? 'verde' : 'oliva'}
              />
            )}
            {puedeVerInventario && (
              <IndicadorInicio etiqueta="Variantes con stock bajo" valor={formatearCantidad(inventario.datos?.variantes_stock_bajo)} detalle={`${formatearCantidad(inventario.datos?.variantes_sin_stock)} sin stock`} estado={inventario} tono="dorado" />
            )}
          </div>
        </section>
      ) : (
        <p className="estado-vacio-inicio">No hay indicadores disponibles para tus permisos actuales.</p>
      )}

      {puedeVerVentas && (
        <section className="actividad-reciente-inicio" aria-labelledby="titulo-actividad-inicio">
          <header className="encabezado-actividad-inicio">
            <div>
              <p className="etiqueta-seccion">Ventas</p>
              <h2 id="titulo-actividad-inicio">Actividad reciente</h2>
            </div>
            <span>Últimas 5 operaciones</span>
          </header>
          {actividad.cargando ? (
            <p className="estado-actividad-inicio" role="status">Consultando actividad...</p>
          ) : actividad.error ? (
            <p className="estado-actividad-inicio estado-error-inicio" role="alert">{actividad.error}</p>
          ) : actividad.datos?.length ? (
            <ul className="lista-actividad-inicio">
              {actividad.datos.map((venta) => (
                <li key={venta.id}>
                  <div><strong>{venta.numero}</strong><span>{venta.comprador_nombre}</span></div>
                  <div className="importe-actividad-inicio"><strong>{formatearMoneda(venta.total)}</strong><span>{formatearFechaHora(venta.fecha_confirmacion)}</span></div>
                  <EstadoEtiqueta
                    tono={venta.estado === 'anulada' ? 'peligro' : 'positivo'}
                    className="estado-venta-inicio"
                  >
                    {venta.estado === 'anulada' ? 'Anulada' : 'Confirmada'}
                  </EstadoEtiqueta>
                </li>
              ))}
            </ul>
          ) : (
            <p className="estado-actividad-inicio">No hay ventas registradas todavía.</p>
          )}
        </section>
      )}
    </div>
  )
}

export default Inicio
