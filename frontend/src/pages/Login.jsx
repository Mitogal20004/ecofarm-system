import { useState } from 'react'
import './Login.css'
import logoEfarm from '../assets/logo-efarm-brand.png'
import { iniciarSesion } from '../services/auth'

function Login({ alIniciarSesion }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [erroresCampos, setErroresCampos] = useState({})
  const [errorAutenticacion, setErrorAutenticacion] = useState('')
  const [enviando, setEnviando] = useState(false)

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

    if (enviando || !validarFormulario()) return

    setEnviando(true)
    setErrorAutenticacion('')

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

  return (
    <main className="pagina-login">
      <section className="panel-identidad" aria-labelledby="marca-efarm">
        <div className="contenido-identidad">
          <div className="marca-ecofarm">
            <img
              id="marca-efarm"
              className="logo-login"
              src={logoEfarm}
              alt="E-farm"
            />
          </div>

          <div className="mensaje-identidad">
            <p className="sobrelinea">Sistema administrativo</p>
            <h1>Gestión clara para cada operación.</h1>
            <p>
              Administra los procesos internos de E-farm desde un entorno
              seguro y centralizado.
            </p>
          </div>
        </div>
      </section>

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
            </div>

            {errorAutenticacion && (
              <p className="error-autenticacion" role="alert">
                {errorAutenticacion}
              </p>
            )}

            <button className="boton-iniciar" type="submit" disabled={enviando}>
              {enviando && (
                <span className="spinner-boton" aria-hidden="true" />
              )}
              {enviando ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
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
