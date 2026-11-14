import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Skeleton,
} from '@heroui/react'
import {
  Boxes,
  Check,
  CircleDollarSign,
  Moon,
  ShoppingCart,
  Sun,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
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

function obtenerHoraGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  return Number(partes.find((parte) => parte.type === 'hour')?.value ?? 0)
}

function obtenerHoraActualizacionGuatemala() {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

function obtenerSaludo(hora) {
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function IconoSaludo({ hora }) {
  const Icono = hora < 19 ? Sun : Moon
  return <Icono className="inicio-icono-saludo" size={34} strokeWidth={1.8} aria-hidden="true" />
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

function IndicadorInicio({ etiqueta, valor, detalle, estado, tono, icono: Icono }) {
  return (
    <Card className={`inicio-metrica inicio-metrica-${tono}`} shadow="sm" isHoverable>
      <CardBody className="inicio-metrica-cuerpo" aria-busy={estado.cargando}>
        <div className="inicio-metrica-cabecera">
          <span className="inicio-metrica-etiqueta">{etiqueta}</span>
          <span className="inicio-metrica-icono" aria-hidden="true"><Icono size={17} strokeWidth={2} /></span>
        </div>
        {estado.cargando ? (
          <Skeleton className="inicio-metrica-carga" isLoaded={false}>
            <div className="inicio-metrica-valor">Q 0.00</div>
          </Skeleton>
        ) : estado.error ? (
          <span className="error-indicador-inicio" role="alert">{estado.error}</span>
        ) : (
          <>
            <strong className="inicio-metrica-valor">{valor}</strong>
            {detalle && <span className="inicio-metrica-detalle">{detalle}</span>}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function Inicio({
  permisos = [],
  nombreUsuario = 'Cuenta E-farm',
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
  const [horaActual, setHoraActual] = useState(obtenerHoraGuatemala)
  const [horaActualizacion, setHoraActualizacion] = useState(obtenerHoraActualizacionGuatemala)

  useEffect(() => {
    const temporizador = window.setInterval(() => {
      setHoraActual(obtenerHoraGuatemala())
      setHoraActualizacion(obtenerHoraActualizacionGuatemala())
    }, 60_000)

    return () => window.clearInterval(temporizador)
  }, [])

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
  const ventasRecientes = actividad.datos ?? []
  const confirmadasRecientes = ventasRecientes.filter((venta) => venta.estado === 'confirmada').length
  const anuladasRecientes = ventasRecientes.filter((venta) => venta.estado === 'anulada').length
  const predominanConfirmadas = confirmadasRecientes > anuladasRecientes
  const hayIndicadores =
    puedeVerReportes || puedeConsultarCaja || puedeVerInventario

  return (
    <div className="inicio-panel inicio-consola">
      <header className="inicio-cabecera">
        <Card className="inicio-hero" shadow="none">
          <CardBody>
            <div className="inicio-hero-contenido">
              <div>
                <span className="inicio-kicker">PANEL DE OPERACIONES</span>
                <h1 id="titulo-panel"><IconoSaludo hora={horaActual} />{obtenerSaludo(horaActual)}, {nombreUsuario}</h1>
                <p className="inicio-subtitulo">Todo en orden. Este es el resumen de la actividad de E-farm para hoy.</p>
              </div>
              <div className="inicio-fecha-panel">
                <span>Zona horaria</span>
                <strong>Guatemala · Hoy</strong>
              </div>
            </div>
          </CardBody>
        </Card>
      </header>

      {(errorSesion || errorAutorizacion) && (
        <Card className="inicio-acceso-pendiente" role="alert">
          <CardBody>
            <div className="inicio-acceso-contenido">
              <div>
                <h2 id="titulo-acceso-pendiente">No se pudo cargar la información de tu perfil</h2>
                <p>{errorSesion || errorAutorizacion}</p>
                <p>Comprueba la conexión con la API y vuelve a consultar tus permisos.</p>
              </div>
              <Button color="primary" variant="flat" onPress={alRefrescarAutorizacion}>Reintentar</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {hayIndicadores ? (
        <section className="inicio-resumen-operativo" aria-labelledby="titulo-resumen-inicio">
          <div className="inicio-seccion-titulo">
            <div>
              <span className="inicio-indice">01 / RESUMEN</span>
              <h2 id="titulo-resumen-inicio">Estado de hoy</h2>
            </div>
              <Chip size="sm" variant="flat" color="success">Actualizado {horaActualizacion}</Chip>
          </div>
          <div className="inicio-lista-metricas">
            {puedeVerReportes && (
              <>
                <IndicadorInicio etiqueta="Ventas del día" valor={formatearMoneda(ventasDia.datos?.ingresos_validos)} detalle="Operaciones confirmadas" estado={ventasDia} tono="petroleo" icono={CircleDollarSign} />
                <IndicadorInicio etiqueta="Operaciones" valor={formatearCantidad(ventasDia.datos?.operaciones_confirmadas)} detalle="Ventas confirmadas" estado={ventasDia} tono="verde" icono={ShoppingCart} />
              </>
            )}
            {puedeConsultarCaja && (
              <IndicadorInicio etiqueta="Estado de caja" valor={cajaAbierta ? 'Abierta' : 'Sin apertura'} detalle={cajaAbierta ? 'Efectivo esperado: ' + formatearMoneda(resumenCaja?.efectivo_esperado) : 'No hay un turno de caja abierto'} estado={cajaActual} tono={cajaAbierta ? 'verde' : 'oliva'} icono={WalletCards} />
            )}
            {puedeVerInventario && (
              <IndicadorInicio etiqueta="Stock bajo" valor={formatearCantidad(inventario.datos?.variantes_stock_bajo)} detalle={formatearCantidad(inventario.datos?.variantes_sin_stock) + ' variantes agotadas'} estado={inventario} tono="dorado" icono={Boxes} />
            )}
          </div>
        </section>
      ) : !errorSesion && !errorAutorizacion ? (
        <Card className="inicio-sin-permisos" shadow="sm">
          <CardBody>
          <strong>Esperando acceso a los módulos</strong>
          <p>Al cargar la autorización de tu perfil aparecerán aquí los indicadores disponibles.</p>
          </CardBody>
        </Card>
      ) : null}

      {puedeVerVentas && (
        <section className="inicio-operaciones-recientes" aria-labelledby="titulo-actividad-inicio">
          <div className="inicio-seccion-titulo">
            <div>
              <span className="inicio-indice">02 / ACTIVIDAD</span>
              <h2 id="titulo-actividad-inicio">Últimas transacciones</h2>
            </div>
            <span className="inicio-etiqueta-periodo">
              5 registros recientes
              {predominanConfirmadas && (
                <TrendingUp
                  className="inicio-tendencia-positiva"
                  size={17}
                  strokeWidth={2.4}
                  aria-label={`${confirmadasRecientes} confirmadas frente a ${anuladasRecientes} anuladas`}
                  title="Predominan las ventas confirmadas"
                />
              )}
            </span>
          </div>
          <Card className="inicio-tabla-contenedor" shadow="sm">
            <CardBody>
              {actividad.cargando ? (
                <Skeleton className="inicio-tabla-carga" />
              ) : actividad.error ? (
                <p className="inicio-tabla-vacio inicio-tabla-error" role="alert">{actividad.error}</p>
              ) : (
                <table className="inicio-tabla" aria-label="Últimas ventas">
                  <thead><tr><th>DOCUMENTO</th><th>CLIENTE</th><th>FECHA</th><th>IMPORTE</th><th>ESTADO</th></tr></thead>
                  <tbody>
                    {(actividad.datos ?? []).length ? actividad.datos.map((venta) => (
                      <tr key={venta.id}>
                        <td><strong className="inicio-numero-documento">{venta.numero}</strong></td>
                        <td>{venta.comprador_nombre}</td>
                        <td>{formatearFechaHora(venta.fecha_confirmacion)}</td>
                        <td><strong className="inicio-importe">{formatearMoneda(venta.total)}</strong></td>
                        <td>
                          <Chip size="sm" color={venta.estado === 'anulada' ? 'danger' : 'success'}>
                            <span className={`inicio-estado-venta ${venta.estado === 'anulada' ? 'anulada' : 'confirmada'}`}>
                              {venta.estado === 'anulada' ? <X size={13} strokeWidth={2.5} aria-hidden="true" /> : <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
                              {venta.estado === 'anulada' ? 'Anulada' : 'Confirmada'}
                            </span>
                          </Chip>
                        </td>
                      </tr>
                    )) : <tr><td colSpan="5" className="inicio-tabla-vacio">No se han registrado ventas.</td></tr>}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </section>
      )}
      <Divider className="inicio-divider" />
      <footer className="inicio-pie">E-farm <span>·</span> ECOFARM S.A. <span>·</span> Uso interno</footer>
    </div>
  )
}

export default Inicio
