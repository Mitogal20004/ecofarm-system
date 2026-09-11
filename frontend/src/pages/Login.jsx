import { useEffect, useState } from 'react'
import './Login.css'
import PanelIdentidad from '../components/PanelIdentidad'
import { iniciarSesion, iniciarSesionConGoogle } from '../services/auth'

const MENSAJE_ERROR_GOOGLE = 'No fue posible iniciar sesión con Google.'

function hayErrorOAuthEnUrl() {
  const parametrosBusqueda = new URLSearchParams(window.location.search)
  const parametrosHash = new URLSearchParams(window.location.hash.slice(1))

  return parametrosBusqueda.has('error') || parametrosHash.has('error')
}

function Login({ alIniciarSesion }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [erroresCampos, setErroresCampos] = useState({})
  const [errorAutenticacion, setErrorAutenticacion] = useState('')
  const [errorGoogle, setErrorGoogle] = useState(() =>
    hayErrorOAuthEnUrl() ? MENSAJE_ERROR_GOOGLE : '',
  )
  const [enviando, setEnviando] = useState(false)
  const [conectandoGoogle, setConectandoGoogle] = useState(false)

  useEffect(() => {
    if (!hayErrorOAuthEnUrl()) return

    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const validarFormulario = () => {
    const nuevosErrores = {}

    if (!usuario.trim()) {
      nuevosErrores.usuario = 'Ingresa tu nombre de usuario.'
    }

    if (!password) {
      nuevosErrores.password = 'Ingresa tu contraseña.'
    }

    setErroresCampos(nuevosErrores)
    return Object.keys(nuevosErrores).length === 0
  }

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (enviando || conectandoGoogle || !validarFormulario()) return

    setEnviando(true)
    setErrorAutenticacion('')
    setErrorGoogle('')

    try {
      const { sesion } = await iniciarSesion(
        usuario.trim().toLowerCase(),
        password,
      )

      setPassword('')
      setMostrarPassword(false)
      alIniciarSesion(sesion)
    } catch (error) {
      const credencialesInvalidas =
        error?.code === 'invalid_credentials' || error?.status === 401

      setErrorAutenticacion(
        credencialesInvalidas
          ? 'Usuario o contraseña incorrectos.'
          : 'No fue posible iniciar sesión. Intenta nuevamente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  const actualizarUsuario = (evento) => {
    setUsuario(evento.target.value)
    setErroresCampos((errores) => ({ ...errores, usuario: '' }))
    setErrorAutenticacion('')
  }

  const actualizarPassword = (evento) => {
    setPassword(evento.target.value)
    setErroresCampos((errores) => ({ ...errores, password: '' }))
    setErrorAutenticacion('')
  }

  const manejarInicioGoogle = async () => {
    if (enviando || conectandoGoogle) return

    setConectandoGoogle(true)
    setErrorAutenticacion('')
    setErrorGoogle('')

    try {
      await iniciarSesionConGoogle()
    } catch {
      setErrorGoogle(MENSAJE_ERROR_GOOGLE)
      setConectandoGoogle(false)
    }
  }

  return (
    <main className="pagina-login">
      <PanelIdentidad />

      <section className="panel-acceso">
        <div className="contenedor-formulario">
          <p className="etiqueta-bienvenida">Acceso interno</p>
          <h2>Bienvenido</h2>
          <p className="instruccion-login">
            Ingresa tus credenciales para continuar en E-farm.
          </p>

          <form className="formulario-login" onSubmit={manejarEnvio} noValidate>
            <div className="grupo-campo">
              <label htmlFor="usuario">Usuario</label>
              <input
                id="usuario"
                name="usuario"
                type="text"
                placeholder="Ej. manuel.galindo"
                value={usuario}
                onChange={actualizarUsuario}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                autoFocus
                disabled={enviando}
                aria-invalid={Boolean(erroresCampos.usuario)}
                aria-describedby={
                  erroresCampos.usuario ? 'error-usuario' : undefined
                }
              />
              {erroresCampos.usuario && (
                <p id="error-usuario" className="error-campo">
                  {erroresCampos.usuario}
                </p>
              )}
            </div>

            <div className="grupo-campo">
              <label htmlFor="password">Contraseña</label>

              <div className="campo-password">
                <input
                  id="password"
                  name="password"
                  type={mostrarPassword ? 'text' : 'password'}
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={actualizarPassword}
                  autoComplete="current-password"
                  disabled={enviando}
                  aria-invalid={Boolean(erroresCampos.password)}
                  aria-describedby={
                    erroresCampos.password ? 'error-password' : undefined
                  }
                />

                <button
                  className="boton-visibilidad-password"
                  type="button"
                  onClick={() => setMostrarPassword((visible) => !visible)}
                  disabled={enviando}
                  aria-label={
                    mostrarPassword
                      ? 'Ocultar contraseña'
                      : 'Mostrar contraseña'
                  }
                  aria-pressed={mostrarPassword}
                >
                  {mostrarPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 8.5 4.2 9.5 6.1a4 4 0 0 1 0 3.8 14 14 0 0 1-2.3 3.2M6.2 6.2A14.2 14.2 0 0 0 2.5 10a4 4 0 0 0 0 4C3.5 15.8 7 20 12 20a10 10 0 0 0 3-.5" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M2.5 10a4 4 0 0 0 0 4C3.5 15.8 7 20 12 20s8.5-4.2 9.5-6a4 4 0 0 0 0-4C20.5 8.2 17 4 12 4S3.5 8.2 2.5 10Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {erroresCampos.password && (
                <p id="error-password" className="error-campo">
                  {erroresCampos.password}
                </p>
              )}

              <a
                className="enlace-recuperacion"
                href="/recuperar-password"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {errorAutenticacion && (
              <p className="error-autenticacion" role="alert">
                {errorAutenticacion}
              </p>
            )}

            <button
              className="boton-iniciar"
              type="submit"
              disabled={enviando || conectandoGoogle}
            >
              {enviando && (
                <span className="spinner-boton" aria-hidden="true" />
              )}
              {enviando ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>

            <div className="separador-oauth" aria-hidden="true">
              <span>o continuar con</span>
            </div>

            <button
              className="boton-google"
              type="button"
              onClick={manejarInicioGoogle}
              disabled={enviando || conectandoGoogle}
            >
              {conectandoGoogle ? (
                <span className="spinner-google" aria-hidden="true" />
              ) : (
                <svg
                  className="icono-google"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="#4285f4"
                    d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"
                  />
                  <path
                    fill="#34a853"
                    d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10.1 10.1 0 0 0 12 22Z"
                  />
                  <path
                    fill="#fbbc05"
                    d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z"
                  />
                  <path
                    fill="#ea4335"
                    d="M12 6a5.5 5.5 0 0 1 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10.1 10.1 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z"
                  />
                </svg>
              )}
              {conectandoGoogle
                ? 'Conectando con Google...'
                : 'Continuar con Google'}
            </button>

            {errorGoogle && (
              <p className="error-autenticacion" role="alert">
                {errorGoogle}
              </p>
            )}
          </form>

          <p className="nota-seguridad">
            Acceso exclusivo para personal autorizado.
          </p>
        </div>
      </section>
    </main>
  )
}

export default Login
