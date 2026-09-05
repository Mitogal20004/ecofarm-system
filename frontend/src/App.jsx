import { useEffect, useState } from 'react'
import './App.css'
import Login from './pages/Login'
import {
  cerrarSesion,
  observarCambiosAutenticacion,
  obtenerSesion,
} from './services/auth'

function App() {
  const [sesion, setSesion] = useState(null)
  const [comprobandoSesion, setComprobandoSesion] = useState(true)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [errorSesion, setErrorSesion] = useState('')

  useEffect(() => {
    let componenteActivo = true

    // La suscripción mantiene la interfaz sincronizada con los cambios que
    // Supabase Auth realice sobre la sesión, sin administrar tokens manualmente.
    const dejarDeObservar = observarCambiosAutenticacion((_evento, nuevaSesion) => {
      if (!componenteActivo) return

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

  const manejarInicioSesion = (nuevaSesion) => {
    setSesion(nuevaSesion)
    setErrorSesion('')
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

  if (!sesion) {
    return <Login alIniciarSesion={manejarInicioSesion} />
  }

  return (
    <div className="aplicacion-administrativa">
      <aside className="barra-lateral">
        <div className="marca-panel">
          <span className="simbolo-panel" aria-hidden="true">
            E
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
