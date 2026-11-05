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
    <div
      className={`inicio-metrica inicio-metrica-${tono}`}
      aria-busy={estado.cargando}
    >
      <span className="inicio-metrica-etiqueta">{etiqueta}</span>
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
          <strong className="inicio-metrica-valor">{valor}</strong>
          {detalle && <span className="inicio-metrica-detalle">{detalle}</span>}
        </>
      )}
    </div>
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

  const fechaLegible = new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  return (
    <div className="inicio-panel inicio-consola">
      <header className="inicio-cabecera">
        <div>
          <p className="inicio-sobretitulo">ECOFARM S.A. <span>/</span> OPERACIONES</p>
          <h1 id="titulo-panel">Centro de operaciones</h1>
          <p className="inicio-fecha">{fechaLegible}</p>
        </div>
        <div className="inicio-cabecera-contexto" aria-label="Información de la plataforma">
          <span className="inicio-contexto-titulo">E-FARM</span>
          <span>Sistema de gestión comercial</span>
        </div>
      </header>

      {(errorSesion || errorAutorizacion) && (
        <section className="inicio-acceso-pendiente" aria-labelledby="titulo-acceso-pendiente" role="alert">
          <div className="inicio-acceso-marca" aria-hidden="true">!</div>
          <div>
            <h2 id="titulo-acceso-pendiente">No se pudo cargar la información de tu perfil</h2>
            <p>{errorSesion || errorAutorizacion}</p>
            <p>Comprueba la conexión con la API y vuelve a consultar tus permisos.</p>
          </div>
          <button type="button" onClick={alRefrescarAutorizacion}>Reintentar</button>
        </section>
      )}

      {hayIndicadores ? (
        <section className="inicio-resumen-operativo" aria-labelledby="titulo-resumen-inicio">
          <div className="inicio-seccion-titulo">
            <div>
              <span className="inicio-indice">01 / OPERACIÓN</span>
              <h2 id="titulo-resumen-inicio">Estado de hoy</h2>
            </div>
            <span className="inicio-etiqueta-periodo">Datos del día</span>
          </div>
          <div className="inicio-lista-metricas">
            {puedeVerReportes && (
              <>
                <IndicadorInicio etiqueta="Ventas del día" valor={formatearMoneda(ventasDia.datos?.ingresos_validos)} detalle="Operaciones confirmadas" estado={ventasDia} tono="petroleo" />
                <IndicadorInicio etiqueta="Operaciones" valor={formatearCantidad(ventasDia.datos?.operaciones_confirmadas)} detalle="Ventas confirmadas" estado={ventasDia} tono="verde" />
              </>
            )}
            {puedeConsultarCaja && (
              <IndicadorInicio etiqueta="Estado de caja" valor={cajaAbierta ? 'Abierta' : 'Sin apertura'} detalle={cajaAbierta ? 'Efectivo esperado: ' + formatearMoneda(resumenCaja?.efectivo_esperado) : 'No hay un turno de caja abierto'} estado={cajaActual} tono={cajaAbierta ? 'verde' : 'oliva'} />
            )}
            {puedeVerInventario && (
              <IndicadorInicio etiqueta="Stock bajo" valor={formatearCantidad(inventario.datos?.variantes_stock_bajo)} detalle={formatearCantidad(inventario.datos?.variantes_sin_stock) + ' variantes agotadas'} estado={inventario} tono="dorado" />
            )}
          </div>
        </section>
      ) : !errorSesion && !errorAutorizacion ? (
        <section className="inicio-sin-permisos">
          <strong>Esperando acceso a los módulos</strong>
          <p>Al cargar la autorización de tu perfil aparecerán aquí los indicadores disponibles.</p>
        </section>
      ) : null}

      {puedeVerVentas && (
        <section className="inicio-operaciones-recientes" aria-labelledby="titulo-actividad-inicio">
          <div className="inicio-seccion-titulo">
            <div>
              <span className="inicio-indice">02 / HISTORIAL</span>
              <h2 id="titulo-actividad-inicio">Últimas transacciones</h2>
            </div>
            <span className="inicio-etiqueta-periodo">5 registros recientes</span>
          </div>
          <div className="inicio-tabla-contenedor">
            <table className="inicio-tabla" aria-label="Últimas ventas">
              <thead><tr><th scope="col">Documento</th><th scope="col">Cliente</th><th scope="col">Fecha</th><th scope="col">Importe</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {actividad.cargando ? (
                  <tr><td colSpan={5} className="inicio-tabla-vacio">Consultando transacciones...</td></tr>
                ) : actividad.error ? (
                  <tr><td colSpan={5} className="inicio-tabla-vacio inicio-tabla-error" role="alert">{actividad.error}</td></tr>
                ) : actividad.datos?.length ? (
                  actividad.datos.map((venta) => (
                    <tr key={venta.id}>
                      <td className="inicio-numero-documento">{venta.numero}</td>
                      <td>{venta.comprador_nombre}</td>
                      <td>{formatearFechaHora(venta.fecha_confirmacion)}</td>
                      <td className="inicio-importe">{formatearMoneda(venta.total)}</td>
                      <td><EstadoEtiqueta tono={venta.estado === 'anulada' ? 'peligro' : 'positivo'}>{venta.estado === 'anulada' ? 'Anulada' : 'Confirmada'}</EstadoEtiqueta></td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="inicio-tabla-vacio">No se han registrado ventas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <footer className="inicio-pie">E-farm <span>·</span> ECOFARM S.A. <span>·</span> Uso interno</footer>
    </div>
  )
}

export default Inicio
