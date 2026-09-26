import { useEffect, useRef, useState } from 'react'
import { crearUsuario } from '../services/usuarios'
import { listarRolesActivos } from '../services/roles'

const PATRON_NOMBRE_USUARIO =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FORMULARIO_INICIAL = {
  nombre_completo: '',
  nombre_usuario: '',
  email: '',
  telefono: '',
  password: '',
  confirmarPassword: '',
  rol_id: '',
}

const obtenerRequisitosPassword = (password) => [
  {
    id: 'longitud',
    texto: 'Mínimo 8 caracteres',
    cumple: password.length >= 8,
  },
  {
    id: 'mayuscula',
    texto: 'Una letra mayúscula',
    cumple: /[A-Z]/.test(password),
  },
  {
    id: 'minuscula',
    texto: 'Una letra minúscula',
    cumple: /[a-z]/.test(password),
  },
  {
    id: 'numero',
    texto: 'Un número',
    cumple: /[0-9]/.test(password),
  },
  {
    id: 'simbolo',
    texto: 'Un símbolo',
    cumple: /[^A-Za-z0-9\s]/.test(password),
  },
]

const obtenerMensajeCreacion = (error) => {
  if (error?.status === 409) {
    return 'El correo o nombre de usuario ya está registrado.'
  }

  if (error?.status === 403) {
    return 'No tienes permiso para crear usuarios.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  return 'No fue posible crear el usuario.'
}

const obtenerMensajeRoles = (error) => {
  if (error?.status === 403) {
    return 'No tienes permiso para consultar roles.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  return 'No fue posible cargar los roles.'
}

function NuevoUsuarioDialog({ abierto, alCerrar, alCrear }) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [errores, setErrores] = useState({})
  const [roles, setRoles] = useState([])
  const [cargandoRoles, setCargandoRoles] = useState(false)
  const [errorRoles, setErrorRoles] = useState('')
  const [errorCreacion, setErrorCreacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const campoInicialRef = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined

    let dialogoActivo = true

    const consultarRoles = async () => {
      setCargandoRoles(true)
      setErrorRoles('')
      setRoles([])

      try {
        const rolesActivos = await listarRolesActivos()

        if (dialogoActivo) {
          setRoles(rolesActivos)
        }
      } catch (error) {
        if (dialogoActivo) {
          setRoles([])
          setErrorRoles(obtenerMensajeRoles(error))
        }
      } finally {
        if (dialogoActivo) {
          setCargandoRoles(false)
        }
      }
    }

    consultarRoles()
    campoInicialRef.current?.focus()

    return () => {
      dialogoActivo = false
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return undefined

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape' && !enviando) {
        setFormulario(FORMULARIO_INICIAL)
        setErrores({})
        setErrorCreacion('')
        setMostrarPassword(false)
        alCerrar()
      }
    }

    document.addEventListener('keydown', manejarTeclado)

    return () => {
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [abierto, alCerrar, enviando])

  if (!abierto) return null

  const requisitosPassword = obtenerRequisitosPassword(formulario.password)

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target
    const valor =
      name === 'nombre_usuario' || name === 'email'
        ? value.toLowerCase()
        : value

    setFormulario((actual) => ({ ...actual, [name]: valor }))
    setErrores((actuales) => ({ ...actuales, [name]: '' }))
    setErrorCreacion('')
  }

  const validarFormulario = () => {
    const nuevosErrores = {}
    const nombreCompleto = formulario.nombre_completo.trim()
    const nombreUsuario = formulario.nombre_usuario.trim().toLowerCase()
    const email = formulario.email.trim().toLowerCase()
    const telefono = formulario.telefono.trim()

    if (!nombreCompleto || nombreCompleto.length > 150) {
      nuevosErrores.nombre_completo = 'Ingresa un nombre completo válido.'
    }

    if (
      nombreUsuario.length < 3 ||
      nombreUsuario.length > 50 ||
      !PATRON_NOMBRE_USUARIO.test(nombreUsuario)
    ) {
      nuevosErrores.nombre_usuario =
        'Usa entre 3 y 50 caracteres: letras, números, punto, guion o guion bajo.'
    }

    if (!PATRON_EMAIL.test(email) || email.length > 254) {
      nuevosErrores.email = 'Ingresa un correo electrónico válido.'
    }

    if (telefono.length > 30) {
      nuevosErrores.telefono = 'El teléfono no puede exceder 30 caracteres.'
    }

    if (!requisitosPassword.every((requisito) => requisito.cumple)) {
      nuevosErrores.password = 'La contraseña no cumple todos los requisitos.'
    }

    if (formulario.password !== formulario.confirmarPassword) {
      nuevosErrores.confirmarPassword = 'Las contraseñas no coinciden.'
    }

    if (!formulario.rol_id) {
      nuevosErrores.rol_id = 'Selecciona un rol.'
    }

    setErrores(nuevosErrores)

    return {
      valido: Object.keys(nuevosErrores).length === 0,
      datos: {
        nombre_completo: nombreCompleto,
        nombre_usuario: nombreUsuario,
        email,
        telefono: telefono || null,
        password: formulario.password,
        rol_id: formulario.rol_id,
      },
    }
  }

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (enviando) return

    const validacion = validarFormulario()

    if (!validacion.valido) return

    setEnviando(true)
    setErrorCreacion('')

    try {
      const resultado = await crearUsuario(validacion.datos)
      setFormulario(FORMULARIO_INICIAL)
      setErrores({})
      setMostrarPassword(false)
      alCrear(resultado.usuario)
    } catch (error) {
      setErrorCreacion(obtenerMensajeCreacion(error))
    } finally {
      setEnviando(false)
    }
  }

  const cerrarDialogo = () => {
    if (enviando) return

    setFormulario(FORMULARIO_INICIAL)
    setErrores({})
    setErrorCreacion('')
    setMostrarPassword(false)
    alCerrar()
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget) {
      cerrarDialogo()
    }
  }

  return (
    <div className="fondo-dialogo-usuario" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-nuevo-usuario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-nuevo-usuario"
      >
        <header className="encabezado-dialogo-usuario">
          <div>
            <p className="etiqueta-dialogo-usuario">Administración</p>
            <h2 id="titulo-nuevo-usuario">Nuevo usuario</h2>
          </div>
          <button
            className="boton-cerrar-dialogo"
            type="button"
            onClick={cerrarDialogo}
            disabled={enviando}
            aria-label="Cerrar formulario"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="formulario-nuevo-usuario" onSubmit={manejarEnvio} noValidate>
          <div className="campo-formulario-usuario">
            <label htmlFor="nuevo-nombre-completo">Nombre completo</label>
            <input
              ref={campoInicialRef}
              id="nuevo-nombre-completo"
              name="nombre_completo"
              type="text"
              value={formulario.nombre_completo}
              onChange={actualizarCampo}
              maxLength={150}
              disabled={enviando}
              aria-invalid={Boolean(errores.nombre_completo)}
              aria-describedby={
                errores.nombre_completo ? 'error-nuevo-nombre' : undefined
              }
            />
            {errores.nombre_completo && (
              <p id="error-nuevo-nombre" className="error-campo-usuario">
                {errores.nombre_completo}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="nuevo-nombre-usuario">Nombre de usuario</label>
            <input
              id="nuevo-nombre-usuario"
              name="nombre_usuario"
              type="text"
              value={formulario.nombre_usuario}
              onChange={actualizarCampo}
              placeholder="manuel.galindo"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck="false"
              maxLength={50}
              disabled={enviando}
              aria-invalid={Boolean(errores.nombre_usuario)}
              aria-describedby={
                errores.nombre_usuario ? 'error-nuevo-usuario' : undefined
              }
            />
            {errores.nombre_usuario && (
              <p id="error-nuevo-usuario" className="error-campo-usuario">
                {errores.nombre_usuario}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="nuevo-email">Correo electrónico</label>
            <input
              id="nuevo-email"
              name="email"
              type="email"
              value={formulario.email}
              onChange={actualizarCampo}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck="false"
              maxLength={254}
              disabled={enviando}
              aria-invalid={Boolean(errores.email)}
              aria-describedby={errores.email ? 'error-nuevo-email' : undefined}
            />
            {errores.email && (
              <p id="error-nuevo-email" className="error-campo-usuario">
                {errores.email}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="nuevo-telefono">Teléfono (opcional)</label>
            <input
              id="nuevo-telefono"
              name="telefono"
              type="tel"
              value={formulario.telefono}
              onChange={actualizarCampo}
              maxLength={30}
              disabled={enviando}
              aria-invalid={Boolean(errores.telefono)}
              aria-describedby={
                errores.telefono ? 'error-nuevo-telefono' : undefined
              }
            />
            {errores.telefono && (
              <p id="error-nuevo-telefono" className="error-campo-usuario">
                {errores.telefono}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario campo-password-usuario">
            <label htmlFor="nuevo-password">Contraseña</label>
            <div className="entrada-password-usuario">
              <input
                id="nuevo-password"
                name="password"
                type={mostrarPassword ? 'text' : 'password'}
                value={formulario.password}
                onChange={actualizarCampo}
                autoComplete="new-password"
                maxLength={1024}
                disabled={enviando}
                aria-invalid={Boolean(errores.password)}
                aria-describedby="requisitos-nuevo-password error-nuevo-password"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((visible) => !visible)}
                disabled={enviando}
                aria-pressed={mostrarPassword}
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <ul id="requisitos-nuevo-password" className="requisitos-password">
              {requisitosPassword.map((requisito) => (
                <li
                  className={requisito.cumple ? 'requisito-cumplido' : ''}
                  key={requisito.id}
                >
                  <span aria-hidden="true">{requisito.cumple ? '✓' : '•'}</span>
                  {requisito.texto}
                </li>
              ))}
            </ul>
            {errores.password && (
              <p id="error-nuevo-password" className="error-campo-usuario">
                {errores.password}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="confirmar-nuevo-password">Confirmar contraseña</label>
            <input
              id="confirmar-nuevo-password"
              name="confirmarPassword"
              type={mostrarPassword ? 'text' : 'password'}
              value={formulario.confirmarPassword}
              onChange={actualizarCampo}
              autoComplete="new-password"
              maxLength={1024}
              disabled={enviando}
              aria-invalid={Boolean(errores.confirmarPassword)}
              aria-describedby={
                errores.confirmarPassword
                  ? 'error-confirmar-password'
                  : undefined
              }
            />
            {errores.confirmarPassword && (
              <p id="error-confirmar-password" className="error-campo-usuario">
                {errores.confirmarPassword}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario campo-rol-usuario">
            <label htmlFor="nuevo-rol">Rol</label>
            <select
              id="nuevo-rol"
              name="rol_id"
              value={formulario.rol_id}
              onChange={actualizarCampo}
              disabled={enviando || cargandoRoles || Boolean(errorRoles)}
              aria-invalid={Boolean(errores.rol_id)}
              aria-describedby={
                errores.rol_id || errorRoles ? 'estado-nuevo-rol' : undefined
              }
            >
              <option value="">
                {cargandoRoles ? 'Consultando roles...' : 'Selecciona un rol'}
              </option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre}
                </option>
              ))}
            </select>
            {(errores.rol_id || errorRoles) && (
              <p id="estado-nuevo-rol" className="error-campo-usuario">
                {errores.rol_id || errorRoles}
              </p>
            )}
          </div>

          {errorCreacion && (
            <p className="error-creacion-usuario" role="alert">
              {errorCreacion}
            </p>
          )}

          <div className="acciones-dialogo-usuario">
            <button
              className="boton-secundario-usuario"
              type="button"
              onClick={cerrarDialogo}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              className="boton-primario-usuario"
              type="submit"
              disabled={
                enviando || cargandoRoles || Boolean(errorRoles) || roles.length === 0
              }
            >
              {enviando ? 'Creando usuario...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default NuevoUsuarioDialog
