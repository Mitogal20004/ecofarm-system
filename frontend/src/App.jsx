import { useEffect, useState } from 'react'
import './App.css'
import logoEfarm from './assets/logo-efarm-brand.png'
import Login from './pages/Login'
import RecuperarPassword from './pages/RecuperarPassword'
import RestablecerPassword from './pages/RestablecerPassword'
import {
  cerrarSesion,
  observarCambiosAutenticacion,
  obtenerSesion,
} from './services/auth'

const RUTA_RECUPERAR_PASSWORD = '/recuperar-password'
const RUTA_RESTABLECER_PASSWORD = '/restablecer-password'

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
  const [comprobandoSesion, setComprobandoSesion] = useState(true)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [errorSesion, setErrorSesion] = useState('')
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
      setSesion(null)
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
          <ul>
            <li className="opcion-navegacion opcion-navegacion-activa">
              <span aria-current="page">Inicio</span>
            </li>
            <li className="opcion-navegacion">Ventas</li>
            <li className="opcion-navegacion">Inventario</li>
            <li className="opcion-navegacion">Clientes</li>
            <li className="opcion-navegacion">Cotizaciones</li>
            <li className="opcion-navegacion">Reportes</li>
            <li className="opcion-navegacion">Administración</li>
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
          >
            {cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </button>
        </header>

        <main className="area-principal">
          <div className="contenido-panel">
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
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
