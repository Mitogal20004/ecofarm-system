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
    <main className="sesion-autenticada">
      <section className="tarjeta-sesion" aria-labelledby="titulo-sesion">
        <div className="marca-compacta" aria-hidden="true">
          E
        </div>
        <p className="etiqueta-estado">Acceso autenticado</p>
        <h1 id="titulo-sesion">Sesión iniciada correctamente</h1>
        {sesion.user?.email && (
          <p className="correo-usuario">{sesion.user.email}</p>
        )}
        <p className="aviso-autorizacion">
          La autorización de roles y permisos se incorporará en una etapa
          posterior.
        </p>
        {errorSesion && (
          <p className="mensaje-error-sesion" role="alert">
            {errorSesion}
          </p>
        )}
        <button
          className="boton-cerrar-sesion"
          type="button"
          onClick={manejarCierreSesion}
          disabled={cerrandoSesion}
        >
          {cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </button>
      </section>
    </main>
  )
}

export default App
