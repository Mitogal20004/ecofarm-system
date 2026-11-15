import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  UserPlus,
  X,
} from 'lucide-react'
import { crearUsuario } from '../services/usuarios'
import { listarRolesActivos } from '../services/roles'
import { obtenerUrlBandera, PAISES_TELEFONO } from '../utils/telefono'

const PATRON_NOMBRE_USUARIO =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATRON_SERIE_DOCUMENTOS = /^[A-Z0-9]{1,8}$/

const FORMULARIO_INICIAL = {
  nombre_completo: '',
  nombre_usuario: '',
  email: '',
  telefono: '',
  serie_documentos: '',
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
  if (error?.codigo === 'serie_documentos_duplicada') {
    return 'La serie de documentos ya está asignada a otro usuario.'
  }

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

function NuevoUsuarioDialog({
  abierto,
  alCerrar,
  alCrear,
  puedeAdministrarRoles,
  alRefrescarAutorizacion,
}) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [errores, setErrores] = useState({})
  const [roles, setRoles] = useState([])
  const [cargandoRoles, setCargandoRoles] = useState(false)
  const [errorRoles, setErrorRoles] = useState('')
  const [errorCreacion, setErrorCreacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [mostrarConfirmarPassword, setMostrarConfirmarPassword] = useState(false)
  const [paisTelefono, setPaisTelefono] = useState(PAISES_TELEFONO[0].codigo)
  const [telefono, setTelefono] = useState('')
  const [selectorPaisAbierto, setSelectorPaisAbierto] = useState(false)
  const [selectorRolAbierto, setSelectorRolAbierto] = useState(false)
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
        const rolesPermitidos = puedeAdministrarRoles
          ? rolesActivos
          : rolesActivos.filter((rol) => rol.nombre !== 'Administrador')

        if (dialogoActivo) {
          setRoles(rolesPermitidos)
          setFormulario((actual) =>
            actual.rol_id &&
            !rolesPermitidos.some((rol) => rol.id === actual.rol_id)
              ? { ...actual, rol_id: '' }
              : actual,
          )
        }
      } catch (error) {
        if (dialogoActivo) {
          setRoles([])
          setErrorRoles(obtenerMensajeRoles(error))

          if ([401, 403].includes(error?.status)) {
            alRefrescarAutorizacion()
          }
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
  }, [abierto, alRefrescarAutorizacion, puedeAdministrarRoles])

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
        setMostrarConfirmarPassword(false)
        setPaisTelefono(PAISES_TELEFONO[0].codigo)
        setTelefono('')
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
        : name === 'serie_documentos'
          ? value.toUpperCase()
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
    const telefonoNormalizado = telefono.replace(/\D/g, '')
    const serieDocumentos = formulario.serie_documentos.trim().toUpperCase()

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

    if (telefonoNormalizado && telefonoNormalizado.length < 7) {
      nuevosErrores.telefono = 'El teléfono debe tener mínimo 7 dígitos.'
    } else if (telefonoNormalizado.length > 15) {
      nuevosErrores.telefono = 'El teléfono no puede superar 15 dígitos.'
    }

    if (
      serieDocumentos &&
      !PATRON_SERIE_DOCUMENTOS.test(serieDocumentos)
    ) {
      nuevosErrores.serie_documentos =
        'Usa hasta 8 caracteres, únicamente letras y números.'
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
        telefono: telefonoNormalizado ? `${paisTelefono}${telefonoNormalizado}` : null,
        serie_documentos: serieDocumentos || null,
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
      setMostrarConfirmarPassword(false)
      setPaisTelefono(PAISES_TELEFONO[0].codigo)
      setTelefono('')
      alCrear(resultado.usuario)
    } catch (error) {
      setErrorCreacion(obtenerMensajeCreacion(error))

      if ([401, 403].includes(error?.status)) {
        alRefrescarAutorizacion()
      }
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
    setMostrarConfirmarPassword(false)
    setPaisTelefono(PAISES_TELEFONO[0].codigo)
    setTelefono('')
    alCerrar()
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget) {
      cerrarDialogo()
    }
  }

  const paisSeleccionado = PAISES_TELEFONO.find((pais) => pais.codigo === paisTelefono) ?? PAISES_TELEFONO[0]
  const cantidadDigitosTelefono = telefono.replace(/\D/g, '').length
  const mensajeTelefono = cantidadDigitosTelefono > 15
    ? 'El número no puede superar los 15 dígitos.'
    : cantidadDigitosTelefono < 7
      ? `Aún faltan ${7 - cantidadDigitosTelefono} dígitos.`
      : 'El teléfono debe tener entre 7 y 15 dígitos.'
  const mensajeEmail = formulario.email &&
    (!PATRON_EMAIL.test(formulario.email) || formulario.email.length > 254)
    ? 'Ingresa un correo electrónico válido.'
    : ''
  const mensajeConfirmarPassword = formulario.confirmarPassword &&
    formulario.password !== formulario.confirmarPassword
    ? 'Las contraseñas no coinciden.'
    : ''

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
            <label htmlFor="nuevo-nombre-completo">Nombre completo *</label>
            <input
              ref={campoInicialRef}
              id="nuevo-nombre-completo"
              name="nombre_completo"
              type="text"
              value={formulario.nombre_completo}
              onChange={actualizarCampo}
              placeholder="Ej. Juan Pérez"
              maxLength={150}
              required
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
            <label htmlFor="nuevo-nombre-usuario">Nombre de usuario *</label>
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
              required
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
            <label htmlFor="nuevo-email">Correo electrónico *</label>
            <input
              id="nuevo-email"
              name="email"
              type="email"
              value={formulario.email}
              onChange={actualizarCampo}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck="false"
              placeholder="ejemplo@correo.com"
              maxLength={254}
              required
              disabled={enviando}
              aria-invalid={Boolean(errores.email || mensajeEmail)}
              aria-describedby={
                errores.email || mensajeEmail ? 'error-nuevo-email' : undefined
              }
            />
            {(errores.email || mensajeEmail) && (
              <p id="error-nuevo-email" className="error-campo-usuario">
                {errores.email || mensajeEmail}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="nuevo-telefono">Teléfono (opcional)</label>
            <div className="telefono-usuario-control">
              <div className="selector-pais-usuario">
                <button
                  id="pais-telefono-nuevo"
                  className="boton-selector-pais-usuario"
                  type="button"
                  onClick={() => setSelectorPaisAbierto((abierto) => !abierto)}
                  aria-label="Código de país"
                  aria-expanded={selectorPaisAbierto}
                  aria-haspopup="listbox"
                  disabled={enviando}
                >
                  <img src={obtenerUrlBandera(paisSeleccionado.iso)} alt="" />
                  <span>{paisSeleccionado.codigo}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                {selectorPaisAbierto && (
                  <div className="lista-paises-usuario" role="listbox" aria-label="Selecciona un país">
                  {PAISES_TELEFONO.map((pais) => (
                    <button
                      key={pais.codigo}
                      type="button"
                      role="option"
                      aria-selected={pais.codigo === paisTelefono}
                      onClick={() => {
                        setPaisTelefono(pais.codigo)
                        setSelectorPaisAbierto(false)
                      }}
                    >
                      <img src={obtenerUrlBandera(pais.iso)} alt="" />
                      <span>{pais.nombre}</span>
                      <strong>{pais.codigo}</strong>
                    </button>
                  ))}
                  </div>
                )}
              </div>
              <input
                id="nuevo-telefono"
                type="tel"
                value={telefono}
                onChange={(evento) => {
                  setTelefono(evento.target.value.replace(/\D/g, ''))
                  setErrores((actuales) => ({ ...actuales, telefono: '' }))
                  setErrorCreacion('')
                }}
                placeholder="55555555"
                maxLength={15}
                inputMode="numeric"
                autoComplete="tel-national"
                disabled={enviando}
                aria-invalid={Boolean(errores.telefono || (telefono && cantidadDigitosTelefono !== 0 && (cantidadDigitosTelefono < 7 || cantidadDigitosTelefono > 15)))}
                aria-describedby="ayuda-nuevo-telefono"
              />
            </div>
            {telefono && (
              <span
                id="ayuda-nuevo-telefono"
                className={`ayuda-telefono-usuario${errores.telefono ? ' ayuda-telefono-usuario-error' : ''}`}
                role={errores.telefono ? 'alert' : undefined}
              >
                {errores.telefono || mensajeTelefono}
              </span>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="nueva-serie-documentos">
              Serie de documentos (opcional)
            </label>
            <input
              id="nueva-serie-documentos"
              name="serie_documentos"
              type="text"
              value={formulario.serie_documentos}
              onChange={actualizarCampo}
              placeholder="V01"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              maxLength={8}
              disabled={enviando}
              aria-invalid={Boolean(errores.serie_documentos)}
              aria-describedby={
                errores.serie_documentos
                  ? 'ayuda-nueva-serie error-nueva-serie'
                  : 'ayuda-nueva-serie'
              }
            />
            <p id="ayuda-nueva-serie" className="ayuda-campo-usuario">
              Identificador interno para documentos comerciales. Ej.: V01,
              CAJA1.
            </p>
            {errores.serie_documentos && (
              <p id="error-nueva-serie" className="error-campo-usuario">
                {errores.serie_documentos}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario campo-password-usuario">
            <label htmlFor="nuevo-password">Contraseña *</label>
            <div className="entrada-password-usuario">
              <input
                id="nuevo-password"
                name="password"
                type={mostrarPassword ? 'text' : 'password'}
                value={formulario.password}
                onChange={actualizarCampo}
                placeholder="Ingresa una contraseña segura"
                autoComplete="new-password"
                maxLength={1024}
                required
                disabled={enviando}
                aria-invalid={Boolean(errores.password)}
                aria-describedby="requisitos-nuevo-password error-nuevo-password"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((visible) => !visible)}
                disabled={enviando}
                aria-pressed={mostrarPassword}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {formulario.password && (
              <ul id="requisitos-nuevo-password" className="requisitos-password">
                {requisitosPassword.map((requisito) => (
                  <li
                    className={requisito.cumple ? 'requisito-cumplido' : ''}
                    key={requisito.id}
                  >
                    <span aria-hidden="true">{requisito.cumple ? <Check size={14} strokeWidth={2.2} /> : <Circle size={10} strokeWidth={1.5} />}</span>
                    {requisito.texto}
                  </li>
                ))}
              </ul>
            )}
            {errores.password && (
              <p id="error-nuevo-password" className="error-campo-usuario">
                {errores.password}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="confirmar-nuevo-password">Confirmar contraseña *</label>
            <div className="entrada-password-usuario">
              <input
                id="confirmar-nuevo-password"
                name="confirmarPassword"
                type={mostrarConfirmarPassword ? 'text' : 'password'}
                value={formulario.confirmarPassword}
                onChange={actualizarCampo}
                placeholder="Repite la contraseña"
                autoComplete="new-password"
                maxLength={1024}
                required
                disabled={enviando}
                aria-invalid={Boolean(errores.confirmarPassword || mensajeConfirmarPassword)}
                aria-describedby={
                  errores.confirmarPassword || mensajeConfirmarPassword
                    ? 'error-confirmar-password'
                    : undefined
                }
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmarPassword((visible) => !visible)}
                disabled={enviando}
                aria-pressed={mostrarConfirmarPassword}
                aria-label={mostrarConfirmarPassword ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                title={mostrarConfirmarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarConfirmarPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {(errores.confirmarPassword || mensajeConfirmarPassword) && (
              <p id="error-confirmar-password" className="error-campo-usuario">
                {errores.confirmarPassword || mensajeConfirmarPassword}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario campo-rol-usuario">
            <label htmlFor="nuevo-rol">Rol *</label>
            <div className="selector-rol-usuario">
              <button
                id="nuevo-rol"
                className="boton-selector-rol-usuario"
                type="button"
                onClick={() => setSelectorRolAbierto((abierto) => !abierto)}
                disabled={enviando || cargandoRoles || Boolean(errorRoles)}
                aria-haspopup="listbox"
                aria-expanded={selectorRolAbierto}
                aria-invalid={Boolean(errores.rol_id)}
                aria-describedby={
                  errores.rol_id || errorRoles ? 'estado-nuevo-rol' : undefined
                }
              >
                {cargandoRoles
                  ? 'Consultando roles...'
                  : roles.find((rol) => rol.id === formulario.rol_id)?.nombre || 'Selecciona un rol'}
                <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
              </button>
              {selectorRolAbierto && (
                <div className="lista-roles-usuario" role="listbox" aria-label="Selecciona un rol">
                  {roles.map((rol) => (
                    <button
                      key={rol.id}
                      type="button"
                      role="option"
                      aria-selected={rol.id === formulario.rol_id}
                      onClick={() => {
                        actualizarCampo({ target: { name: 'rol_id', value: rol.id } })
                        setSelectorRolAbierto(false)
                      }}
                    >
                      {rol.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                <X size={17} strokeWidth={2} aria-hidden="true" />
                Cancelar
            </button>
            <button
              className="boton-primario-usuario"
              type="submit"
              disabled={
                enviando || cargandoRoles || Boolean(errorRoles) || roles.length === 0
              }
            >
              <UserPlus size={17} strokeWidth={2} aria-hidden="true" />
              {enviando ? 'Creando usuario...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default NuevoUsuarioDialog
