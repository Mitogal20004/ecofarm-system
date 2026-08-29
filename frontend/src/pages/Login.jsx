import { useState } from 'react'
import './Login.css'
import { iniciarSesion } from '../services/auth'

function Login({ alIniciarSesion }) {
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [erroresCampos, setErroresCampos] = useState({})
  const [errorAutenticacion, setErrorAutenticacion] = useState('')
  const [enviando, setEnviando] = useState(false)

  const validarFormulario = () => {
    const nuevosErrores = {}

    if (!correo.trim()) {
      nuevosErrores.correo = 'Ingresa tu correo electrónico.'
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
      const { sesion } = await iniciarSesion(correo.trim(), password)

      setPassword('')
      alIniciarSesion(sesion)
    } catch (error) {
      const credencialesInvalidas = error?.code === 'invalid_credentials'

      setErrorAutenticacion(
        credencialesInvalidas
          ? 'Correo o contraseña incorrectos.'
          : 'No fue posible iniciar sesión. Intenta nuevamente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  const actualizarCorreo = (evento) => {
    setCorreo(evento.target.value)
    setErroresCampos((errores) => ({ ...errores, correo: '' }))
    setErrorAutenticacion('')
  }

  const actualizarPassword = (evento) => {
    setPassword(evento.target.value)
    setErroresCampos((errores) => ({ ...errores, password: '' }))
    setErrorAutenticacion('')
  }

  return (
    <main className="pagina-login">
      <section className="panel-identidad" aria-labelledby="marca-ecofarm">
        <div className="contenido-identidad">
          <div className="marca-ecofarm">
            <span className="simbolo-ecofarm" aria-hidden="true">
              E
            </span>
            <span id="marca-ecofarm">ECOFARM S.A.</span>
          </div>

          <div className="mensaje-identidad">
            <p className="sobrelinea">Gestión empresarial</p>
            <h1>Cultivamos orden para hacer crecer cada operación.</h1>
            <p>
              Un espacio seguro para administrar los procesos internos de
              ECOFARM.
            </p>
          </div>

          <div className="paisaje-abstracto" aria-hidden="true">
            <span className="sol" />
            <span className="surco surco-uno" />
            <span className="surco surco-dos" />
            <span className="surco surco-tres" />
          </div>
        </div>
      </section>

      <section className="panel-acceso">
        <div className="contenedor-formulario">
          <p className="etiqueta-bienvenida">Acceso interno</p>
          <h2>Bienvenido</h2>
          <p className="instruccion-login">
            Ingresa tus credenciales para continuar en ECOFARM.
          </p>

          <form className="formulario-login" onSubmit={manejarEnvio} noValidate>
            <div className="grupo-campo">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                name="correo"
                type="email"
                value={correo}
                onChange={actualizarCorreo}
                autoComplete="email"
                autoFocus
                disabled={enviando}
                aria-invalid={Boolean(erroresCampos.correo)}
                aria-describedby={
                  erroresCampos.correo ? 'error-correo' : undefined
                }
              />
              {erroresCampos.correo && (
                <p id="error-correo" className="error-campo">
                  {erroresCampos.correo}
                </p>
              )}
            </div>

            <div className="grupo-campo">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={actualizarPassword}
                autoComplete="current-password"
                disabled={enviando}
                aria-invalid={Boolean(erroresCampos.password)}
                aria-describedby={
                  erroresCampos.password ? 'error-password' : undefined
                }
              />
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
