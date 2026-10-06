import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import iconoCerrarSesion from './assets/icono-cerrar-sesion.svg'
import logoEfarm from './assets/logo-efarm-brand.png'
import Login from './pages/Login'
import RecuperarPassword from './pages/RecuperarPassword'
import RestablecerPassword from './pages/RestablecerPassword'
import Clientes from './pages/Clientes'
import Inventario from './pages/Inventario'
import Productos from './pages/Productos'
import Usuarios from './pages/Usuarios'
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
const VISTA_INVENTARIO = 'inventario'
const VISTA_PRODUCTOS = 'productos'
const VISTA_USUARIOS = 'usuarios'

const PERMISO_POR_VISTA = {
  [VISTA_CLIENTES]: 'cliente.ver',
  [VISTA_INVENTARIO]: 'inventario.ver',
  [VISTA_PRODUCTOS]: 'producto.ver',
  [VISTA_USUARIOS]: 'usuario.ver',
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
        const permisoRequerido = PERMISO_POR_VISTA[vista]

        return permisoRequerido && !codigos.includes(permisoRequerido)
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
      <aside className="barra-lateral">
        <div className="marca-panel">
          <span className="simbolo-panel" aria-hidden="true">
            <img src={logoEfarm} alt="" />
          </span>
          <span className="nombre-marca-panel">
            <strong>E-farm</strong>
            <small>Sistema administrativo</small>
          </span>
        </div>

        <nav className="navegacion-principal" aria-label="Navegación principal">
          <p className="titulo-navegacion">Menú principal</p>
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
                Inicio
              </button>
            </li>
            {tienePermiso('venta.ver') && (
              <li className="opcion-navegacion">Ventas</li>
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
                  Clientes
                </button>
              </li>
            )}
            {tienePermiso('cotizacion.ver') && (
              <li className="opcion-navegacion">Cotizaciones</li>
            )}
            {tienePermiso('reporte.ver') && (
              <li className="opcion-navegacion">Reportes</li>
            )}
            {tienePermiso('usuario.ver') && (
              <li className="grupo-navegacion">
                <span className="opcion-navegacion opcion-navegacion-grupo">
                  Administración
                </span>
                <ul className="subnavegacion">
                  <li>
                    <button
                      className={`opcion-navegacion opcion-subnavegacion boton-navegacion${
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
                      Usuarios
                    </button>
                  </li>
                </ul>
              </li>
            )}
            {comprobandoAutorizacion && !autorizacion && (
              <li className="estado-navegacion" aria-live="polite">
                Consultando accesos...
              </li>
            )}
          </ul>
        </nav>
      </aside>

      <div className="contenido-aplicacion">
        <header className="barra-superior">
          <div className="identidad-usuario">
            <span className="etiqueta-usuario">Usuario actual</span>
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
              <img src={iconoCerrarSesion} alt="" aria-hidden="true" />
            )}
          </button>
        </header>

        <main className="area-principal">
          <div className="contenido-panel">
            {vistaActual === VISTA_CLIENTES ? (
              <Clientes
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
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
            ) : vistaActual === VISTA_USUARIOS ? (
              <Usuarios
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : (
              <>
                <section
                  className="encabezado-panel"
                  aria-labelledby="titulo-panel"
                >
                  <p className="etiqueta-seccion">Panel administrativo</p>
                  <h1 id="titulo-panel">Bienvenido a E-farm</h1>
                  <p className="descripcion-panel">
                    Espacio de trabajo para las operaciones internas de E-farm.
                  </p>
                </section>

                {errorSesion && (
                  <p className="mensaje-error-sesion" role="alert">
                    {errorSesion}
                  </p>
                )}

                {errorAutorizacion && (
                  <p className="mensaje-error-sesion" role="alert">
                    {errorAutorizacion}
                  </p>
                )}

                <section
                  className="tarjeta-sesion"
                  aria-labelledby="titulo-sesion"
                >
                  <div>
                    <p className="etiqueta-estado">Sesión activa</p>
                    <h2 id="titulo-sesion">Acceso al sistema</h2>
                  </div>
                  <p className="descripcion-sesion">
                    Tu sesión se encuentra activa.
                  </p>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
