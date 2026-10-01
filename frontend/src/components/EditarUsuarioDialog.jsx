import { useEffect, useRef, useState } from 'react'
import { actualizarPerfilUsuario } from '../services/usuarios'

const obtenerMensajeError = (error) => {
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
    return 'La cuenta no puede desactivarse porque debe permanecer al menos un Administrador activo.'
  }

  return 'No fue posible actualizar el usuario.'
}

function EditarUsuarioDialog({ usuario, alCerrar, alGuardar }) {
  const [nombreCompleto, setNombreCompleto] = useState(
    usuario.nombre_completo ?? '',
  )
  const [telefono, setTelefono] = useState(usuario.telefono ?? '')
  const [activo, setActivo] = useState(usuario.activo === true)
  const [errores, setErrores] = useState({})
  const [errorActualizacion, setErrorActualizacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const nombreRef = useRef(null)
  const envioEnCursoRef = useRef(false)

  useEffect(() => {
    nombreRef.current?.focus()
  }, [])

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

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (envioEnCursoRef.current) return

    const nombreNormalizado = nombreCompleto.trim()
    const telefonoNormalizado = telefono.trim()
    const nuevosErrores = {}

    if (!nombreNormalizado || nombreNormalizado.length > 150) {
      nuevosErrores.nombre_completo = 'Ingresa un nombre completo válido.'
    }

    if (telefonoNormalizado.length > 30) {
      nuevosErrores.telefono = 'El teléfono no puede exceder 30 caracteres.'
    }

    setErrores(nuevosErrores)
    setErrorActualizacion('')

    if (Object.keys(nuevosErrores).length > 0) return

    const cambios = {}
    const telefonoOriginal = usuario.telefono ?? ''

    if (nombreNormalizado !== usuario.nombre_completo) {
      cambios.nombre_completo = nombreNormalizado
    }

    if (telefonoNormalizado !== telefonoOriginal) {
      cambios.telefono = telefonoNormalizado || null
    }

    if (activo !== usuario.activo) {
      cambios.activo = activo
    }

    if (Object.keys(cambios).length === 0) {
      setErrorActualizacion('No hay cambios por guardar.')
      return
    }

    if (
      usuario.activo === true &&
      activo === false &&
      !window.confirm(
        `¿Confirmas que deseas desactivar la cuenta de ${usuario.nombre_completo}?`,
      )
    ) {
      return
    }

    envioEnCursoRef.current = true
    setEnviando(true)

    try {
      const resultado = await actualizarPerfilUsuario(usuario.id, cambios)
      alGuardar(resultado.perfil)
    } catch (error) {
      setErrorActualizacion(obtenerMensajeError(error))
    } finally {
      envioEnCursoRef.current = false
      setEnviando(false)
    }
  }

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
              Actualiza los datos del perfil y el estado de acceso.
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

        <form className="formulario-nuevo-usuario" onSubmit={manejarEnvio} noValidate>
          <div className="campo-formulario-usuario">
            <label htmlFor="editar-nombre-completo">Nombre completo</label>
            <input
              ref={nombreRef}
              id="editar-nombre-completo"
              type="text"
              value={nombreCompleto}
              onChange={(evento) => {
                setNombreCompleto(evento.target.value)
                setErrores((actuales) => ({
                  ...actuales,
                  nombre_completo: '',
                }))
                setErrorActualizacion('')
              }}
              maxLength={150}
              disabled={enviando}
              aria-invalid={Boolean(errores.nombre_completo)}
              aria-describedby={
                errores.nombre_completo ? 'error-editar-nombre' : undefined
              }
            />
            {errores.nombre_completo && (
              <p id="error-editar-nombre" className="error-campo-usuario">
                {errores.nombre_completo}
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
                setErrores((actuales) => ({ ...actuales, telefono: '' }))
                setErrorActualizacion('')
              }}
              maxLength={30}
              disabled={enviando}
              aria-invalid={Boolean(errores.telefono)}
              aria-describedby={
                errores.telefono ? 'error-editar-telefono' : undefined
              }
            />
            {errores.telefono && (
              <p id="error-editar-telefono" className="error-campo-usuario">
                {errores.telefono}
              </p>
            )}
          </div>

          <div className="campo-formulario-usuario">
            <label htmlFor="editar-email">Correo electrónico</label>
            <input
              id="editar-email"
              type="email"
              value={usuario.email ?? ''}
              readOnly
              aria-readonly="true"
            />
            <p className="ayuda-campo-usuario">El correo no se modifica en esta operación.</p>
          </div>

          <fieldset className="resumen-roles-edicion">
            <legend>Roles actuales</legend>
            <div className="roles-usuario">
              {Array.isArray(usuario.roles) && usuario.roles.length > 0 ? (
                usuario.roles.map((rol) => (
                  <span
                    className={`etiqueta-rol${
                      rol.activo ? '' : ' etiqueta-rol-inactivo'
                    }`}
                    key={rol.id}
                  >
                    {rol.nombre}
                  </span>
                ))
              ) : (
                <span className="dato-no-disponible">Sin roles asignados</span>
              )}
            </div>
            <p className="ayuda-campo-usuario">Los roles son solo de consulta en esta tarea.</p>
          </fieldset>

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
                  setErrorActualizacion('')
                }}
                disabled={enviando}
              />
              <span>{activo ? 'Activa' : 'Inactiva'}</span>
            </label>
          </div>

          {usuario.activo && !activo && (
            <p className="aviso-desactivacion-usuario">
              Se solicitará confirmación antes de desactivar esta cuenta.
            </p>
          )}

          {errorActualizacion && (
            <p className="error-creacion-usuario" role="alert">
              {errorActualizacion}
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
              disabled={enviando}
            >
              {enviando ? 'Guardando cambios...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default EditarUsuarioDialog
