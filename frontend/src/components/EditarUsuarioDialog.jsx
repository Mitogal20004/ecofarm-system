import { useEffect, useRef, useState } from 'react'
import { listarRolesActivos } from '../services/roles'
import {
  actualizarPerfilUsuario,
  reemplazarRolesUsuario,
} from '../services/usuarios'

const obtenerMensajePerfil = (error) => {
  if (error?.status === 400) {
    return 'Revisa los datos ingresados e intenta nuevamente.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  if (error?.status === 403) {
    return 'No tienes permiso para modificar este usuario.'
  }

  if (error?.status === 404) {
    return 'El usuario solicitado ya no existe.'
  }

  if (error?.status === 409) {
    return 'La cuenta activa debe conservar un rol y el sistema al menos un Administrador activo.'
  }

  return 'No fue posible actualizar el perfil.'
}

const obtenerMensajeRoles = (error) => {
  if (error?.status === 400) {
    return 'Selecciona solamente roles activos y válidos.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  if (error?.status === 403) {
    return 'No tienes permiso para asignar los roles seleccionados.'
  }

  if (error?.status === 404) {
    return 'El usuario solicitado ya no existe.'
  }

  if (error?.status === 409) {
    return 'El cambio debe conservar un rol para cada usuario activo y al menos un Administrador activo.'
  }

  return 'No fue posible actualizar los roles.'
}

const obtenerMensajeConsultaRoles = (error) => {
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  if (error?.status === 403) {
    return 'No tienes permiso para consultar los roles disponibles.'
  }

  return 'No fue posible cargar los roles disponibles.'
}

const ordenarIds = (ids) => [...ids].sort()

const conjuntosIguales = (primeros, segundos) => {
  const listaPrimera = ordenarIds(primeros)
  const listaSegunda = ordenarIds(segundos)

  return (
    listaPrimera.length === listaSegunda.length &&
    listaPrimera.every((id, indice) => id === listaSegunda[indice])
  )
}

function EditarUsuarioDialog({
  usuario,
  puedeAdministrarRoles,
  alCerrar,
  alActualizar,
  alRefrescarAutorizacion,
}) {
  const [perfilBase, setPerfilBase] = useState(usuario)
  const [nombreCompleto, setNombreCompleto] = useState(
    usuario.nombre_completo ?? '',
  )
  const [telefono, setTelefono] = useState(usuario.telefono ?? '')
  const [activo, setActivo] = useState(usuario.activo === true)
  const [rolesActuales, setRolesActuales] = useState(usuario.roles ?? [])
  const [rolesDisponibles, setRolesDisponibles] = useState([])
  const [rolesSeleccionados, setRolesSeleccionados] = useState(
    () =>
      new Set(
        (usuario.roles ?? [])
          .filter((rol) => rol.activo)
          .map((rol) => rol.id),
      ),
  )
  const [erroresPerfil, setErroresPerfil] = useState({})
  const [errorPerfil, setErrorPerfil] = useState('')
  const [mensajePerfil, setMensajePerfil] = useState('')
  const [errorRoles, setErrorRoles] = useState('')
  const [mensajeRoles, setMensajeRoles] = useState('')
  const [cargandoRoles, setCargandoRoles] = useState(true)
  const [errorConsultaRoles, setErrorConsultaRoles] = useState('')
  const [enviandoPerfil, setEnviandoPerfil] = useState(false)
  const [enviandoRoles, setEnviandoRoles] = useState(false)
  const nombreRef = useRef(null)
  const envioPerfilRef = useRef(false)
  const envioRolesRef = useRef(false)
  const enviando = enviandoPerfil || enviandoRoles

  useEffect(() => {
    nombreRef.current?.focus()
  }, [])

  useEffect(() => {
    let dialogoActivo = true

    const consultarRoles = async () => {
      setCargandoRoles(true)
      setErrorConsultaRoles('')

      try {
        const roles = await listarRolesActivos()
        const rolesPermitidos = puedeAdministrarRoles
          ? roles
          : roles.filter((rol) => rol.nombre !== 'Administrador')

        if (dialogoActivo) {
          setRolesDisponibles(rolesPermitidos)
        }
      } catch (error) {
        if (dialogoActivo) {
          setRolesDisponibles([])
          setErrorConsultaRoles(obtenerMensajeConsultaRoles(error))

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

    return () => {
      dialogoActivo = false
    }
  }, [alRefrescarAutorizacion, puedeAdministrarRoles])

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape' && !enviando) {
        alCerrar()
      }
    }

    document.addEventListener('keydown', manejarTeclado)

    return () => {
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar, enviando])

  const cerrarDialogo = () => {
    if (!enviando) alCerrar()
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget) {
      cerrarDialogo()
    }
  }

  const manejarEnvioPerfil = async (evento) => {
    evento.preventDefault()

    if (envioPerfilRef.current || envioRolesRef.current) return

    const nombreNormalizado = nombreCompleto.trim()
    const telefonoNormalizado = telefono.trim()
    const nuevosErrores = {}

    if (!nombreNormalizado || nombreNormalizado.length > 150) {
      nuevosErrores.nombre_completo = 'Ingresa un nombre completo válido.'
    }

    if (telefonoNormalizado.length > 30) {
      nuevosErrores.telefono = 'El teléfono no puede exceder 30 caracteres.'
    }

    setErroresPerfil(nuevosErrores)
    setErrorPerfil('')
    setMensajePerfil('')

    if (Object.keys(nuevosErrores).length > 0) return

    if (
      perfilBase.activo === false &&
      activo === true &&
      !rolesActuales.some((rol) => rol.activo)
    ) {
      setErrorPerfil(
        'Asigna al menos un rol antes de reactivar este usuario.',
      )
      return
    }

    const cambios = {}
    const telefonoOriginal = perfilBase.telefono ?? ''

    if (nombreNormalizado !== perfilBase.nombre_completo) {
      cambios.nombre_completo = nombreNormalizado
    }

    if (telefonoNormalizado !== telefonoOriginal) {
      cambios.telefono = telefonoNormalizado || null
    }

    if (activo !== perfilBase.activo) {
      cambios.activo = activo
    }

    if (Object.keys(cambios).length === 0) {
      setErrorPerfil('No hay cambios de perfil por guardar.')
      return
    }

    if (
      perfilBase.activo === true &&
      activo === false &&
      !window.confirm(
        `¿Confirmas que deseas desactivar la cuenta de ${perfilBase.nombre_completo}?`,
      )
    ) {
      return
    }

    envioPerfilRef.current = true
    setEnviandoPerfil(true)

    try {
      const resultado = await actualizarPerfilUsuario(perfilBase.id, cambios)

      setPerfilBase((actual) => ({ ...actual, ...resultado.perfil }))
      setActivo(resultado.perfil.activo === true)
      setErrorRoles('')
      setMensajeRoles('')
      setMensajePerfil('Perfil actualizado correctamente.')
      alActualizar(perfilBase.id)
    } catch (error) {
      setErrorPerfil(obtenerMensajePerfil(error))

      if ([401, 403].includes(error?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      envioPerfilRef.current = false
      setEnviandoPerfil(false)
    }
  }

  const alternarRol = (rolId) => {
    setRolesSeleccionados((actuales) => {
      const siguientes = new Set(actuales)

      if (siguientes.has(rolId)) {
        siguientes.delete(rolId)
      } else {
        siguientes.add(rolId)
      }

      return siguientes
    })
    setErrorRoles('')
    setMensajeRoles('')
  }

  const manejarEnvioRoles = async (evento) => {
    evento.preventDefault()

    if (envioRolesRef.current || envioPerfilRef.current) return

    setErrorRoles('')
    setMensajeRoles('')

    const rolesIds = rolesDisponibles
      .filter((rol) => rolesSeleccionados.has(rol.id))
      .map((rol) => rol.id)
    const rolesActualesIds = rolesActuales.map((rol) => rol.id)
    const perfilPersistidoActivo = perfilBase.activo === true

    if (perfilPersistidoActivo && rolesIds.length === 0) {
      setErrorRoles('Un usuario activo debe conservar al menos un rol.')
      return
    }

    if (conjuntosIguales(rolesIds, rolesActualesIds)) {
      setErrorRoles('No hay cambios de roles por guardar.')
      return
    }

    if (
      !window.confirm(
        `¿Confirmas que deseas reemplazar los roles de ${perfilBase.nombre_completo}?`,
      )
    ) {
      return
    }

    envioRolesRef.current = true
    setEnviandoRoles(true)

    try {
      const resultado = await reemplazarRolesUsuario(perfilBase.id, rolesIds)

      setRolesActuales(resultado.roles)
      setRolesSeleccionados(new Set(resultado.roles.map((rol) => rol.id)))
      setMensajeRoles('Roles actualizados correctamente.')
      alActualizar(perfilBase.id)
    } catch (error) {
      setErrorRoles(obtenerMensajeRoles(error))

      if ([401, 403].includes(error?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      envioRolesRef.current = false
      setEnviandoRoles(false)
    }
  }

  const hayRolesInactivos = rolesActuales.some((rol) => !rol.activo)

  return (
    <div className="fondo-dialogo-usuario" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-nuevo-usuario dialogo-editar-usuario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editar-usuario"
        aria-describedby="descripcion-editar-usuario"
      >
        <header className="encabezado-dialogo-usuario">
          <div>
            <p className="etiqueta-dialogo-usuario">Administración</p>
            <h2 id="titulo-editar-usuario">Editar usuario</h2>
            <p id="descripcion-editar-usuario" className="descripcion-dialogo-usuario">
              El perfil y los roles se guardan por separado.
            </p>
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

        <form
          className="formulario-nuevo-usuario formulario-editar-perfil"
          onSubmit={manejarEnvioPerfil}
          noValidate
        >
          <div className="titulo-bloque-edicion">
            <h3>Datos del perfil</h3>
            <p>Nombre, teléfono y estado de acceso.</p>
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="editar-nombre-completo">Nombre completo</label>
            <input
              ref={nombreRef}
              id="editar-nombre-completo"
              type="text"
              value={nombreCompleto}
              onChange={(evento) => {
                setNombreCompleto(evento.target.value)
                setErroresPerfil((actuales) => ({
                  ...actuales,
                  nombre_completo: '',
                }))
                setErrorPerfil('')
                setMensajePerfil('')
              }}
              maxLength={150}
              disabled={enviando}
              aria-invalid={Boolean(erroresPerfil.nombre_completo)}
              aria-describedby={
                erroresPerfil.nombre_completo
                  ? 'error-editar-nombre'
                  : undefined
              }
            />
            {erroresPerfil.nombre_completo && (
              <p id="error-editar-nombre" className="error-campo-usuario">
                {erroresPerfil.nombre_completo}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="editar-telefono">Teléfono (opcional)</label>
            <input
              id="editar-telefono"
              type="tel"
              value={telefono}
              onChange={(evento) => {
                setTelefono(evento.target.value)
                setErroresPerfil((actuales) => ({
                  ...actuales,
                  telefono: '',
                }))
                setErrorPerfil('')
                setMensajePerfil('')
              }}
              maxLength={30}
              disabled={enviando}
              aria-invalid={Boolean(erroresPerfil.telefono)}
              aria-describedby={
                erroresPerfil.telefono ? 'error-editar-telefono' : undefined
              }
            />
            {erroresPerfil.telefono && (
              <p id="error-editar-telefono" className="error-campo-usuario">
                {erroresPerfil.telefono}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="editar-email">Correo electrónico</label>
            <input
              id="editar-email"
              type="email"
              value={perfilBase.email ?? ''}
              readOnly
              aria-readonly="true"
            />
            <p className="ayuda-campo-usuario">
              El correo no se modifica en esta operación.
            </p>
          </div>

          <div className="control-estado-edicion">
            <div>
              <strong>Cuenta activa</strong>
              <span>
                {activo
                  ? 'El usuario puede utilizar las funciones autorizadas.'
                  : 'El usuario no podrá utilizar las funciones del sistema.'}
              </span>
            </div>
            <label className="interruptor-estado-usuario">
              <input
                type="checkbox"
                aria-label="Cuenta activa"
                checked={activo}
                onChange={(evento) => {
                  setActivo(evento.target.checked)
                  setErrorPerfil('')
                  setMensajePerfil('')
                  setErrorRoles('')
                  setMensajeRoles('')
                }}
                disabled={enviando}
              />
              <span>{activo ? 'Activa' : 'Inactiva'}</span>
            </label>
          </div>

          {perfilBase.activo && !activo && (
            <p className="aviso-desactivacion-usuario">
              Se solicitará confirmación antes de desactivar esta cuenta.
            </p>
          )}

          {mensajePerfil && (
            <p className="mensaje-exito-operacion" role="status">
              {mensajePerfil}
            </p>
          )}

          {errorPerfil && (
            <p className="error-creacion-usuario" role="alert">
              {errorPerfil}
            </p>
          )}

          <div className="acciones-dialogo-usuario">
            <button
              className="boton-primario-usuario"
              type="submit"
              disabled={enviando}
            >
              {enviandoPerfil ? 'Guardando perfil...' : 'Guardar perfil'}
            </button>
          </div>
        </form>

        <section className="seccion-roles-edicion" aria-labelledby="titulo-roles-edicion">
          <div className="titulo-bloque-edicion">
            <h3 id="titulo-roles-edicion">Roles del usuario</h3>
            <p>Esta operación reemplaza el conjunto completo de roles.</p>
          </div>

          <div className="roles-actuales-edicion">
            <strong>Asignación actual</strong>
            <div className="roles-usuario">
              {rolesActuales.length > 0 ? (
                rolesActuales.map((rol) => (
                  <span
                    className={`etiqueta-rol${
                      rol.activo ? '' : ' etiqueta-rol-inactivo'
                    }`}
                    key={rol.id}
                    title={rol.activo ? undefined : 'Rol inactivo'}
                  >
                    {rol.nombre}
                  </span>
                ))
              ) : (
                <span className="dato-no-disponible">Sin roles asignados</span>
              )}
            </div>
          </div>

          {hayRolesInactivos && (
            <p className="aviso-desactivacion-usuario">
              Los roles inactivos no pueden seleccionarse y se eliminarán al guardar una nueva asignación.
            </p>
          )}

          <form className="formulario-roles-edicion" onSubmit={manejarEnvioRoles}>
            <fieldset disabled={enviando || cargandoRoles || Boolean(errorConsultaRoles)}>
              <legend>Roles disponibles</legend>

              {cargandoRoles ? (
                <p className="estado-consulta-roles" aria-live="polite">
                  Consultando roles...
                </p>
              ) : errorConsultaRoles ? (
                <p className="error-creacion-usuario" role="alert">
                  {errorConsultaRoles}
                </p>
              ) : (
                <div className="opciones-roles-edicion">
                  {rolesDisponibles.map((rol) => (
                    <label className="opcion-rol-edicion" key={rol.id}>
                      <input
                        type="checkbox"
                        checked={rolesSeleccionados.has(rol.id)}
                        onChange={() => alternarRol(rol.id)}
                      />
                      <span>
                        <strong>{rol.nombre}</strong>
                        {rol.descripcion && <small>{rol.descripcion}</small>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {!puedeAdministrarRoles && !cargandoRoles && !errorConsultaRoles && (
              <p className="ayuda-campo-usuario">
                Solo se muestran los roles operativos que tienes permitido asignar.
              </p>
            )}

            {mensajeRoles && (
              <p className="mensaje-exito-operacion" role="status">
                {mensajeRoles}
              </p>
            )}

            {errorRoles && (
              <p className="error-creacion-usuario" role="alert">
                {errorRoles}
              </p>
            )}

            <div className="acciones-dialogo-usuario">
              <button
                className="boton-primario-usuario"
                type="submit"
                disabled={
                  enviando || cargandoRoles || Boolean(errorConsultaRoles)
                }
              >
                {enviandoRoles ? 'Guardando roles...' : 'Guardar roles'}
              </button>
            </div>
          </form>
        </section>

        <footer className="pie-dialogo-edicion">
          <button
            className="boton-secundario-usuario"
            type="button"
            onClick={cerrarDialogo}
            disabled={enviando}
          >
            Cerrar
          </button>
        </footer>
      </section>
    </div>
  )
}

export default EditarUsuarioDialog
