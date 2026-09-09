import { useState } from 'react'
import PanelIdentidad from '../components/PanelIdentidad'
import { actualizarPassword } from '../services/auth'
import './Login.css'
import './Password.css'

function IconoVisibilidad({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 8.5 4.2 9.5 6.1a4 4 0 0 1 0 3.8 14 14 0 0 1-2.3 3.2M6.2 6.2A14.2 14.2 0 0 0 2.5 10a4 4 0 0 0 0 4C3.5 15.8 7 20 12 20a10 10 0 0 0 3-.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 10a4 4 0 0 0 0 4C3.5 15.8 7 20 12 20s8.5-4.2 9.5-6a4 4 0 0 0 0-4C20.5 8.2 17 4 12 4S3.5 8.2 2.5 10Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ReglaPassword({ cumple, children }) {
  return (
    <li className={cumple ? 'regla-password regla-cumplida' : 'regla-password'}>
      <span className="indicador-regla" aria-hidden="true">
        {cumple ? '✓' : '○'}
      </span>
      <span>{children}</span>
      <span className="solo-lectores">
        {cumple ? ' (cumplido)' : ' (pendiente)'}
      </span>
    </li>
  )
}

function RestablecerPassword({
  recuperacionValida,
  comprobandoRecuperacion,
  alSolicitarNuevoEnlace,
  alVolverLogin,
}) {
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmacionPassword, setConfirmacionPassword] = useState('')
  const [mostrarNuevaPassword, setMostrarNuevaPassword] = useState(false)
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [volviendo, setVolviendo] = useState(false)
  const [errorActualizacion, setErrorActualizacion] = useState('')
  const [actualizada, setActualizada] = useState(false)

  const reglas = {
    longitud: nuevaPassword.length >= 8,
    mayuscula: /[A-Z]/.test(nuevaPassword),
    minuscula: /[a-z]/.test(nuevaPassword),
    numero: /\d/.test(nuevaPassword),
    simbolo: /[^A-Za-z0-9\s]/.test(nuevaPassword),
  }
  const cumpleReglas = Object.values(reglas).every(Boolean)
  const coinciden =
    confirmacionPassword.length > 0 && nuevaPassword === confirmacionPassword
  const formularioValido = cumpleReglas && coinciden

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (guardando || !formularioValido) return

    setGuardando(true)
    setErrorActualizacion('')

    try {
      await actualizarPassword(nuevaPassword)
      setNuevaPassword('')
      setConfirmacionPassword('')
      setMostrarNuevaPassword(false)
      setMostrarConfirmacion(false)
      setActualizada(true)
    } catch {
      setErrorActualizacion(
        'No fue posible actualizar la contraseña. Solicita un nuevo enlace e intenta nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const manejarVolverLogin = async () => {
    setVolviendo(true)
    setErrorActualizacion('')

    try {
      await alVolverLogin()
    } catch {
      setErrorActualizacion(
        'No fue posible volver al inicio de sesión. Intenta nuevamente.',
      )
      setVolviendo(false)
    }
  }

  let contenido

  if (comprobandoRecuperacion) {
    contenido = (
      <div className="estado-recuperacion" aria-live="polite">
        <span className="indicador-carga" aria-hidden="true" />
        <p>Validando enlace de recuperación...</p>
      </div>
    )
  } else if (!recuperacionValida) {
    contenido = (
      <div className="resultado-recuperacion">
        <p className="mensaje-enlace-invalido" role="alert">
          Este enlace de recuperación no es válido o ha expirado.
        </p>
        <button
          className="boton-iniciar"
          type="button"
          onClick={alSolicitarNuevoEnlace}
        >
          Solicitar un nuevo enlace
        </button>
      </div>
    )
  } else if (actualizada) {
    contenido = (
      <div className="resultado-recuperacion" aria-live="polite">
        <p className="mensaje-confirmacion">
          Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.
        </p>
        {errorActualizacion && (
          <p className="error-autenticacion" role="alert">
            {errorActualizacion}
          </p>
        )}
        <button
          className="boton-iniciar"
          type="button"
          onClick={manejarVolverLogin}
          disabled={volviendo}
        >
          {volviendo ? 'Volviendo...' : 'Volver al inicio de sesión'}
        </button>
      </div>
    )
  } else {
    contenido = (
      <form className="formulario-login" onSubmit={manejarEnvio} noValidate>
        <div className="grupo-campo">
          <label htmlFor="nueva-password">Nueva contraseña</label>
          <div className="campo-password">
            <input
              id="nueva-password"
              name="nueva-password"
              type={mostrarNuevaPassword ? 'text' : 'password'}
              placeholder="Ingresa tu nueva contraseña"
              value={nuevaPassword}
              onChange={(evento) => {
                setNuevaPassword(evento.target.value)
                setErrorActualizacion('')
              }}
              autoComplete="new-password"
              autoFocus
              disabled={guardando}
              aria-describedby="reglas-password"
            />
            <button
              className="boton-visibilidad-password"
              type="button"
              onClick={() => setMostrarNuevaPassword((visible) => !visible)}
              disabled={guardando}
              aria-label={
                mostrarNuevaPassword
                  ? 'Ocultar nueva contraseña'
                  : 'Mostrar nueva contraseña'
              }
              aria-pressed={mostrarNuevaPassword}
            >
              <IconoVisibilidad visible={mostrarNuevaPassword} />
            </button>
          </div>

          <ul
            id="reglas-password"
            className="reglas-password"
            aria-live="polite"
          >
            <ReglaPassword cumple={reglas.longitud}>
              Mínimo 8 caracteres
            </ReglaPassword>
            <ReglaPassword cumple={reglas.mayuscula}>
              Al menos una letra mayúscula
            </ReglaPassword>
            <ReglaPassword cumple={reglas.minuscula}>
              Al menos una letra minúscula
            </ReglaPassword>
            <ReglaPassword cumple={reglas.numero}>
              Al menos un número
            </ReglaPassword>
            <ReglaPassword cumple={reglas.simbolo}>
              Al menos un símbolo
            </ReglaPassword>
          </ul>
        </div>

        <div className="grupo-campo">
          <label htmlFor="confirmar-password">Confirmar contraseña</label>
          <div className="campo-password">
            <input
              id="confirmar-password"
              name="confirmar-password"
              type={mostrarConfirmacion ? 'text' : 'password'}
              placeholder="Repite tu nueva contraseña"
              value={confirmacionPassword}
              onChange={(evento) => {
                setConfirmacionPassword(evento.target.value)
                setErrorActualizacion('')
              }}
              autoComplete="new-password"
              disabled={guardando}
              aria-invalid={
                confirmacionPassword.length > 0 && !coinciden
              }
              aria-describedby={
                confirmacionPassword.length > 0 && !coinciden
                  ? 'error-confirmacion-password'
                  : undefined
              }
            />
            <button
              className="boton-visibilidad-password"
              type="button"
              onClick={() => setMostrarConfirmacion((visible) => !visible)}
              disabled={guardando}
              aria-label={
                mostrarConfirmacion
                  ? 'Ocultar confirmación de contraseña'
                  : 'Mostrar confirmación de contraseña'
              }
              aria-pressed={mostrarConfirmacion}
            >
              <IconoVisibilidad visible={mostrarConfirmacion} />
            </button>
          </div>
          {confirmacionPassword.length > 0 && !coinciden && (
            <p id="error-confirmacion-password" className="error-campo">
              Las contraseñas no coinciden.
            </p>
          )}
        </div>

        {errorActualizacion && (
          <p className="error-autenticacion" role="alert">
            {errorActualizacion}
          </p>
        )}

        <button
          className="boton-iniciar"
          type="submit"
          disabled={guardando || !formularioValido}
        >
          {guardando && <span className="spinner-boton" aria-hidden="true" />}
          {guardando ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </form>
    )
  }

  return (
    <main className="pagina-login pagina-recuperacion">
      <PanelIdentidad />

      <section className="panel-acceso">
        <div className="contenedor-formulario contenedor-recuperacion">
          <p className="etiqueta-bienvenida">Acceso interno</p>
          <h2>Restablecer contraseña</h2>
          {!actualizada && recuperacionValida && (
            <p className="instruccion-login">
              Define una nueva contraseña segura para tu cuenta.
            </p>
          )}
          {contenido}
        </div>
      </section>
    </main>
  )
}

export default RestablecerPassword
