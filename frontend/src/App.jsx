import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { LogOut } from 'lucide-react'
import logoEfarm from './assets/logo-efarm-brand.png'
import IconoInterfaz from './components/IconoInterfaz'
import Login from './pages/Login'
import RecuperarPassword from './pages/RecuperarPassword'
import RestablecerPassword from './pages/RestablecerPassword'
import Clientes from './pages/Clientes'
import Cotizaciones from './pages/Cotizaciones'
import Inventario from './pages/Inventario'
import Inicio from './pages/Inicio'
import Productos from './pages/Productos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Ventas from './pages/Ventas'
import Caja from './pages/Caja'
import './styles/efarm-business.css'
import './styles/ventas-efarm.css'
import { limpiarOperacionesPendientesCaja } from './services/caja'
import {
  cerrarSesion,
  observarCambiosAutenticacion,
  obtenerAutorizacionActual,
  obtenerSesion,
} from './services/auth'

const RUTA_RECUPERAR_PASSWORD = '/recuperar-password'
const RUTA_RESTABLECER_PASSWORD = '/restablecer-password'
const VISTA_INICIO = 'inicio'
const VISTA_CLIENTES = 'clientes'
const VISTA_CAJA = 'caja'
const VISTA_COTIZACIONES = 'cotizaciones'
const VISTA_INVENTARIO = 'inventario'
const VISTA_PRODUCTOS = 'productos'
const VISTA_REPORTES = 'reportes'
const VISTA_USUARIOS = 'usuarios'
const VISTA_VENTAS = 'ventas'

const PERMISO_POR_VISTA = {
  [VISTA_CAJA]: ['caja.operar', 'caja.ver'],
  [VISTA_CLIENTES]: ['cliente.ver'],
  [VISTA_COTIZACIONES]: ['cotizacion.ver'],
  [VISTA_INVENTARIO]: ['inventario.ver'],
  [VISTA_PRODUCTOS]: ['producto.ver'],
  [VISTA_REPORTES]: ['reporte.ver'],
  [VISTA_USUARIOS]: ['usuario.ver'],
  [VISTA_VENTAS]: ['venta.ver', 'venta.crear'],
}

function normalizarRuta(pathname) {
  const ruta = pathname.replace(/\/+$/, '')
  return ruta || '/'
}

function hayCredencialesRecuperacionEnUrl() {
  const parametrosHash = new URLSearchParams(window.location.hash.slice(1))
  const parametrosBusqueda = new URLSearchParams(window.location.search)

  return (
    parametrosHash.get('type') === 'recovery' ||
    parametrosBusqueda.has('code')
  )
}

function App() {
  const [sesion, setSesion] = useState(null)
  const [autorizacion, setAutorizacion] = useState(null)
  const [comprobandoSesion, setComprobandoSesion] = useState(true)
  const [comprobandoAutorizacion, setComprobandoAutorizacion] = useState(false)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [errorSesion, setErrorSesion] = useState('')
  const [errorAutorizacion, setErrorAutorizacion] = useState('')
  const [vistaActual, setVistaActual] = useState(VISTA_INICIO)
  const [ventaInicialId, setVentaInicialId] = useState(null)
  const [rutaActual, setRutaActual] = useState(() =>
    normalizarRuta(window.location.pathname),
  )
  const [sesionRecuperacionValida, setSesionRecuperacionValida] =
    useState(false)
  const [comprobandoRecuperacion, setComprobandoRecuperacion] = useState(
    () =>
      rutaActual === RUTA_RESTABLECER_PASSWORD &&
      hayCredencialesRecuperacionEnUrl(),
  )
  const solicitudAutorizacionRef = useRef(0)

  const permisos = Array.isArray(autorizacion?.permisos)
    ? autorizacion.permisos
        .map((permiso) => permiso?.codigo)
        .filter((codigo) => typeof codigo === 'string')
    : []
  const tienePermiso = (codigo) => permisos.includes(codigo)

  const refrescarAutorizacion = useCallback(async () => {
    const solicitudId = solicitudAutorizacionRef.current + 1
    solicitudAutorizacionRef.current = solicitudId

    if (!sesion?.access_token) {
      setAutorizacion(null)
      setComprobandoAutorizacion(false)
      return null
    }

    setComprobandoAutorizacion(true)

    try {
      const autorizacionActual = await obtenerAutorizacionActual()

      if (solicitudAutorizacionRef.current !== solicitudId) return null

      const codigos = autorizacionActual.permisos
        .map((permiso) => permiso?.codigo)
        .filter((codigo) => typeof codigo === 'string')

      setAutorizacion(autorizacionActual)
      setErrorAutorizacion('')
      setVistaActual((vista) => {
        const permisosRequeridos = PERMISO_POR_VISTA[vista]

        return permisosRequeridos &&
          !permisosRequeridos.some((codigo) => codigos.includes(codigo))
          ? VISTA_INICIO
          : vista
      })

      return autorizacionActual
    } catch (error) {
      if (solicitudAutorizacionRef.current !== solicitudId) return null

      setAutorizacion(null)
      setVistaActual(VISTA_INICIO)

      if (error?.status === 401) {
        setErrorAutorizacion('Tu sesión ya no es válida.')

        try {
          await cerrarSesion()
        } catch {
          // La sesión local se descarta igualmente al recibir un 401.
        }

        limpiarOperacionesPendientesCaja()
        setSesion(null)
      } else if (error?.status === 403) {
        setErrorAutorizacion(
          'Tu perfil no tiene acceso habilitado en este momento.',
        )
      } else {
        setErrorAutorizacion(
          'No fue posible actualizar los permisos. Intenta nuevamente.',
        )
      }

      return null
    } finally {
      if (solicitudAutorizacionRef.current === solicitudId) {
        setComprobandoAutorizacion(false)
      }
    }
  }, [sesion?.access_token])

  useEffect(() => {
    let componenteActivo = true

    // La suscripción mantiene la interfaz sincronizada con los cambios que
    // Supabase Auth realice sobre la sesión, sin administrar tokens manualmente.
    const dejarDeObservar = observarCambiosAutenticacion((evento, nuevaSesion) => {
      if (!componenteActivo) return

      if (evento === 'PASSWORD_RECOVERY') {
        setSesionRecuperacionValida(Boolean(nuevaSesion))
        setComprobandoRecuperacion(false)
      }

      setSesion(nuevaSesion)

      if (!nuevaSesion) {
        limpiarOperacionesPendientesCaja()
        solicitudAutorizacionRef.current += 1
        setAutorizacion(null)
        setComprobandoAutorizacion(false)
        setVistaActual(VISTA_INICIO)
      }

      setComprobandoSesion(false)
      setErrorSesion('')
    })

    const comprobarSesionInicial = async () => {
      try {
        const sesionActual = await obtenerSesion()

        if (componenteActivo) {
          setSesion(sesionActual)
        }
      } catch {
        if (componenteActivo) {
          setErrorSesion(
            'No fue posible comprobar la sesión. Intenta recargar la página.',
          )
        }
      } finally {
        if (componenteActivo) {
          setComprobandoSesion(false)
        }
      }
    }

    comprobarSesionInicial()

    return () => {
      componenteActivo = false
      dejarDeObservar()
    }
  }, [])

  useEffect(() => {
    if (!sesion?.access_token) return undefined

    const temporizador = window.setTimeout(refrescarAutorizacion, 0)

    return () => window.clearTimeout(temporizador)
  }, [refrescarAutorizacion, sesion?.access_token])

  useEffect(() => {
    if (!sesion?.access_token) return undefined

    let ultimoRefresco = 0
    const refrescarAlRecuperarFoco = () => {
      const ahora = Date.now()

      if (document.visibilityState !== 'visible' || ahora - ultimoRefresco < 1000) {
        return
      }

      ultimoRefresco = ahora
      refrescarAutorizacion()
    }

    window.addEventListener('focus', refrescarAlRecuperarFoco)
    document.addEventListener('visibilitychange', refrescarAlRecuperarFoco)

    return () => {
      window.removeEventListener('focus', refrescarAlRecuperarFoco)
      document.removeEventListener('visibilitychange', refrescarAlRecuperarFoco)
    }
  }, [refrescarAutorizacion, sesion?.access_token])

  useEffect(() => {
    const manejarCambioRuta = () => {
      setRutaActual(normalizarRuta(window.location.pathname))
    }

    window.addEventListener('popstate', manejarCambioRuta)

    return () => window.removeEventListener('popstate', manejarCambioRuta)
  }, [])

  useEffect(() => {
    if (!comprobandoRecuperacion) return undefined

    const temporizador = window.setTimeout(() => {
      setComprobandoRecuperacion(false)
    }, 4000)

    return () => window.clearTimeout(temporizador)
  }, [comprobandoRecuperacion])

  const manejarInicioSesion = (nuevaSesion) => {
    setSesion(nuevaSesion)
    setErrorSesion('')
    setErrorAutorizacion('')
  }

  const reemplazarRuta = (ruta) => {
    window.history.replaceState(null, '', ruta)
    setRutaActual(normalizarRuta(ruta))
  }

  const manejarNuevoEnlace = () => {
    setSesionRecuperacionValida(false)
    setComprobandoRecuperacion(false)
    reemplazarRuta(RUTA_RECUPERAR_PASSWORD)
  }

  const manejarFinRestablecimiento = async () => {
    await cerrarSesion()
    setSesion(null)
    setSesionRecuperacionValida(false)
    reemplazarRuta('/')
  }

  const manejarCierreSesion = async () => {
    if (cerrandoSesion) return

    setCerrandoSesion(true)
    setErrorSesion('')

    try {
      await cerrarSesion()
      limpiarOperacionesPendientesCaja()
      solicitudAutorizacionRef.current += 1
      setSesion(null)
      setAutorizacion(null)
      setVistaActual(VISTA_INICIO)
    } catch {
      setErrorSesion('No fue posible cerrar la sesión. Intenta nuevamente.')
    } finally {
      setCerrandoSesion(false)
    }
  }

  if (comprobandoSesion) {
    return (
      <main className="estado-sesion" aria-live="polite">
        <span className="indicador-carga" aria-hidden="true" />
        <p>Comprobando sesión...</p>
      </main>
    )
  }

  if (rutaActual === RUTA_RESTABLECER_PASSWORD) {
    return (
      <RestablecerPassword
        recuperacionValida={sesionRecuperacionValida}
        comprobandoRecuperacion={comprobandoRecuperacion}
        alSolicitarNuevoEnlace={manejarNuevoEnlace}
        alVolverLogin={manejarFinRestablecimiento}
      />
    )
  }

  if (rutaActual === RUTA_RECUPERAR_PASSWORD) {
    return <RecuperarPassword alVolverLogin={() => reemplazarRuta('/')} />
  }

  if (!sesion) {
    return (
      <Login alIniciarSesion={manejarInicioSesion} />
    )
  }

  return (
    <div className="aplicacion-administrativa">
      <header className="barra-superior">
        <div className="marca-panel">
          <span className="simbolo-panel" aria-hidden="true">
            <img src={logoEfarm} alt="" />
          </span>
          <span className="nombre-marca-panel">
            <strong>E-farm</strong>
            <small>Gestión agrícola</small>
          </span>
        </div>
        <div className="acciones-barra-superior">
          <div className="identidad-usuario">
            <span className="etiqueta-usuario">Sesión de trabajo</span>
            <strong className="nombre-usuario">
              {autorizacion?.perfil?.nombre_completo || 'Cuenta E-farm'}
            </strong>
            {sesion.user?.email && (
              <span className="correo-usuario">{sesion.user.email}</span>
            )}
          </div>

          <button
            className="boton-cerrar-sesion"
            type="button"
            onClick={manejarCierreSesion}
            disabled={cerrandoSesion}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            {cerrandoSesion ? (
              <span className="spinner-cerrar-sesion" aria-hidden="true" />
            ) : (
              <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <aside className="barra-lateral">

        <nav className="navegacion-principal" aria-label="Navegación principal">
          <p className="titulo-navegacion">General</p>
          <ul className="lista-navegacion-principal">
            <li>
              <button
                className={`opcion-navegacion boton-navegacion${
                  vistaActual === VISTA_INICIO
                    ? ' opcion-navegacion-activa'
                    : ''
                }`}
                type="button"
                onClick={() => setVistaActual(VISTA_INICIO)}
                aria-current={
                  vistaActual === VISTA_INICIO ? 'page' : undefined
                }
              >
                <IconoInterfaz nombre="inicio" className="icono-navegacion" />
                Inicio
              </button>
            </li>
            {(tienePermiso('venta.ver') || tienePermiso('venta.crear')) && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_VENTAS
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => {
                    setVentaInicialId(null)
                    setVistaActual(VISTA_VENTAS)
                  }}
                  aria-current={
                    vistaActual === VISTA_VENTAS ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="ventas" className="icono-navegacion" />
                  Ventas
                </button>
              </li>
            )}
            {(tienePermiso('caja.operar') || tienePermiso('caja.ver')) && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_CAJA
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_CAJA)}
                  aria-current={
                    vistaActual === VISTA_CAJA ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="caja" className="icono-navegacion" />
                  Caja
                </button>
              </li>
            )}
            {tienePermiso('inventario.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_INVENTARIO
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_INVENTARIO)}
                  aria-current={
                    vistaActual === VISTA_INVENTARIO ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="inventario" className="icono-navegacion" />
                  Inventario
                </button>
              </li>
            )}
            {tienePermiso('producto.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_PRODUCTOS
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_PRODUCTOS)}
                  aria-current={
                    vistaActual === VISTA_PRODUCTOS ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="productos" className="icono-navegacion" />
                  Productos
                </button>
              </li>
            )}
            {tienePermiso('cliente.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_CLIENTES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_CLIENTES)}
                  aria-current={
                    vistaActual === VISTA_CLIENTES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="clientes" className="icono-navegacion" />
                  Clientes
                </button>
              </li>
            )}
            {tienePermiso('cotizacion.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_COTIZACIONES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_COTIZACIONES)}
                  aria-current={
                    vistaActual === VISTA_COTIZACIONES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="cotizaciones" className="icono-navegacion" />
                  Cotizaciones
                </button>
              </li>
            )}
            {tienePermiso('reporte.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_REPORTES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_REPORTES)}
                  aria-current={
                    vistaActual === VISTA_REPORTES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="reportes" className="icono-navegacion" />
                  Reportes
                </button>
              </li>
            )}
            {comprobandoAutorizacion && !autorizacion && (
              <li className="estado-navegacion" aria-live="polite">
                Consultando accesos...
              </li>
            )}
          </ul>

          {tienePermiso('usuario.ver') && (
            <div className="seccion-navegacion-administracion">
              <p className="titulo-navegacion">Administración</p>
              <ul className="lista-navegacion-principal">
                <li>
                  <button
                    className={`opcion-navegacion boton-navegacion${
                      vistaActual === VISTA_USUARIOS
                        ? ' opcion-navegacion-activa'
                        : ''
                    }`}
                    type="button"
                    onClick={() => setVistaActual(VISTA_USUARIOS)}
                    aria-current={
                      vistaActual === VISTA_USUARIOS ? 'page' : undefined
                    }
                  >
                    <IconoInterfaz nombre="usuarios" className="icono-navegacion" />
                    Usuarios
                  </button>
                </li>
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="contenido-aplicacion">
        <main className="area-principal">
          <div className="contenido-panel" key={vistaActual}>
            {vistaActual === VISTA_VENTAS ? (
              <Ventas
                key={autorizacion?.perfil?.id ?? 'sin-usuario'}
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                ventaInicialId={ventaInicialId}
                alConsumirVentaInicial={() => setVentaInicialId(null)}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_CAJA ? (
              <Caja
                key={autorizacion?.perfil?.id ?? 'sin-usuario'}
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_CLIENTES ? (
              <Clientes
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_COTIZACIONES ? (
              <Cotizaciones
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
                alAbrirVenta={(ventaId) => {
                  setVentaInicialId(ventaId)
                  setVistaActual(VISTA_VENTAS)
                }}
              />
            ) : vistaActual === VISTA_INVENTARIO ? (
              <Inventario
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_PRODUCTOS ? (
              <Productos
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_REPORTES ? (
              <Reportes alRefrescarAutorizacion={refrescarAutorizacion} />
            ) : vistaActual === VISTA_USUARIOS ? (
              <Usuarios
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : (
              <Inicio
                permisos={permisos}
                errorSesion={errorSesion}
                errorAutorizacion={errorAutorizacion}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
