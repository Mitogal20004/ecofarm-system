import { useState } from 'react'
import PanelIdentidad from '../components/PanelIdentidad'
import { solicitarRecuperacionPassword } from '../services/auth'
import './Login.css'
import './Password.css'

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RecuperarPassword({ alVolverLogin }) {
  const [correo, setCorreo] = useState('')
  const [errorCorreo, setErrorCorreo] = useState('')
  const [errorSolicitud, setErrorSolicitud] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (enviando) return

    const correoNormalizado = correo.trim().toLowerCase()

    if (!correoNormalizado) {
      setErrorCorreo('Ingresa tu correo electrónico.')
      return
    }

    if (!FORMATO_CORREO.test(correoNormalizado)) {
      setErrorCorreo('Ingresa un correo electrónico válido.')
      return
    }

    setEnviando(true)
    setErrorCorreo('')
    setErrorSolicitud('')

    try {
      await solicitarRecuperacionPassword(correoNormalizado)
      setCorreo('')
      setEnviado(true)
    } catch {
      setErrorSolicitud(
        'No fue posible enviar el enlace. Intenta nuevamente más tarde.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pagina-login pagina-recuperacion">
      <PanelIdentidad />

      <section className="panel-acceso">
        <div className="contenedor-formulario contenedor-recuperacion">
          <p className="etiqueta-bienvenida">Acceso interno</p>
          <h2>Recuperar contraseña</h2>

          {enviado ? (
            <div className="resultado-recuperacion" aria-live="polite">
              <p className="mensaje-confirmacion">
                Si existe una cuenta asociada a ese correo, recibirás un enlace
                para restablecer tu contraseña.
              </p>
              <button
                className="enlace-secundario"
                type="button"
                onClick={alVolverLogin}
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <p className="instruccion-login">
                Ingresa el correo asociado a tu cuenta para recibir instrucciones
                de recuperación.
              </p>

              <form
                className="formulario-login"
                onSubmit={manejarEnvio}
                noValidate
              >
                <div className="grupo-campo">
                  <label htmlFor="correo-recuperacion">Correo electrónico</label>
                  <input
                    id="correo-recuperacion"
                    name="correo"
                    type="email"
                    placeholder="nombre@empresa.com"
                    value={correo}
                    onChange={(evento) => {
                      setCorreo(evento.target.value)
                      setErrorCorreo('')
                      setErrorSolicitud('')
                    }}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck="false"
                    autoFocus
                    disabled={enviando}
                    aria-invalid={Boolean(errorCorreo)}
                    aria-describedby={errorCorreo ? 'error-correo' : undefined}
                  />
                  {errorCorreo && (
                    <p id="error-correo" className="error-campo">
                      {errorCorreo}
                    </p>
                  )}
                </div>

                {errorSolicitud && (
                  <p className="error-autenticacion" role="alert">
                    {errorSolicitud}
                  </p>
                )}

                <button
                  className="boton-iniciar"
                  type="submit"
                  disabled={enviando}
                >
                  {enviando && (
                    <span className="spinner-boton" aria-hidden="true" />
                  )}
                  {enviando ? 'Enviando...' : 'Enviar enlace'}
                </button>

                <button
                  className="enlace-secundario"
                  type="button"
                  onClick={alVolverLogin}
                  disabled={enviando}
                >
                  Volver al inicio de sesión
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

export default RecuperarPassword
