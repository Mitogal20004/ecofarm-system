import { useEffect, useRef, useState } from 'react'
import { actualizarCliente, crearCliente } from '../services/clientes'

const FORMULARIO_INICIAL = {
  tipo: 'individual',
  nombre_completo: '',
  razon_social: '',
  nit: '',
  telefono: '',
  correo_electronico: '',
  direccion: '',
  activo: true,
}

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const crearFormulario = (cliente) =>
  cliente
    ? {
        tipo: cliente.tipo,
        nombre_completo: cliente.nombre_completo ?? '',
        razon_social: cliente.razon_social ?? '',
        nit: cliente.nit,
        telefono: cliente.telefono ?? '',
        correo_electronico: cliente.correo_electronico ?? '',
        direccion: cliente.direccion,
        activo: cliente.activo,
      }
    : FORMULARIO_INICIAL

const obtenerMensajeError = (error, editando) => {
  if (error?.status === 409) {
    return 'Ya existe un cliente con el NIT proporcionado.'
  }

  if (error?.status === 403) {
    return `No tienes permiso para ${editando ? 'editar' : 'crear'} clientes.`
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  if (error?.status === 404) {
    return 'El cliente solicitado ya no existe.'
  }

  return `No fue posible ${editando ? 'actualizar' : 'crear'} el cliente.`
}

function ClienteDialog({ abierto, cliente, alCerrar, alGuardar }) {
  const [formulario, setFormulario] = useState(() => crearFormulario(cliente))
  const [errores, setErrores] = useState({})
  const [errorEnvio, setErrorEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campoInicialRef = useRef(null)
  const editando = Boolean(cliente)

  useEffect(() => {
    if (!abierto) return

    const temporizador = window.setTimeout(
      () => campoInicialRef.current?.focus(),
      0,
    )

    return () => window.clearTimeout(temporizador)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return undefined

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
  }, [abierto, alCerrar, enviando])

  if (!abierto) return null

  const actualizarCampo = (evento) => {
    const { checked, name, type, value } = evento.target

    setFormulario((actual) => ({
      ...actual,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'tipo'
        ? value === 'individual'
          ? { razon_social: '' }
          : { nombre_completo: '' }
        : {}),
    }))
    setErrores((actuales) => ({ ...actuales, [name]: '' }))
    setErrorEnvio('')
  }

  const validar = () => {
    const nuevosErrores = {}
    const nombreCompleto = formulario.nombre_completo.trim()
    const razonSocial = formulario.razon_social.trim()
    const nit = formulario.nit.trim().toUpperCase().replace(/[\s-]+/g, '')
    const telefono = formulario.telefono.trim()
    const correoElectronico = formulario.correo_electronico
      .trim()
      .toLowerCase()
    const direccion = formulario.direccion.trim().replace(/\s+/g, ' ')

    if (formulario.tipo === 'individual' && !nombreCompleto) {
      nuevosErrores.nombre_completo = 'Ingresa el nombre completo.'
    }

    if (formulario.tipo === 'empresa' && !razonSocial) {
      nuevosErrores.razon_social = 'Ingresa la razón social.'
    }

    if (!nit || nit.length > 30) {
      nuevosErrores.nit = 'Ingresa un NIT válido de hasta 30 caracteres.'
    }

    if (telefono.length > 30) {
      nuevosErrores.telefono = 'El teléfono no puede exceder 30 caracteres.'
    }

    if (
      correoElectronico &&
      (correoElectronico.length > 254 || !PATRON_EMAIL.test(correoElectronico))
    ) {
      nuevosErrores.correo_electronico = 'Ingresa un correo válido.'
    }

    if (!direccion || direccion.length > 500) {
      nuevosErrores.direccion = 'Ingresa una dirección de hasta 500 caracteres.'
    }

    setErrores(nuevosErrores)

    return {
      valido: Object.keys(nuevosErrores).length === 0,
      datos: {
        tipo: formulario.tipo,
        nombre_completo:
          formulario.tipo === 'individual' ? nombreCompleto : null,
        razon_social: formulario.tipo === 'empresa' ? razonSocial : null,
        nit,
        telefono: telefono || null,
        correo_electronico: correoElectronico || null,
        direccion,
        ...(editando ? { activo: formulario.activo } : {}),
      },
    }
  }

  const manejarEnvio = async (evento) => {
    evento.preventDefault()

    if (enviando) return

    const validacion = validar()

    if (!validacion.valido) return

    if (
      editando &&
      cliente.activo &&
      !validacion.datos.activo &&
      !window.confirm(
        '¿Deseas desactivar este cliente? Su historial se conservará.',
      )
    ) {
      return
    }

    setEnviando(true)
    setErrorEnvio('')

    try {
      const resultado = editando
        ? await actualizarCliente(cliente.id, validacion.datos)
        : await crearCliente(validacion.datos)

      alGuardar(resultado.cliente, editando)
    } catch (error) {
      setErrorEnvio(obtenerMensajeError(error, editando))
    } finally {
      setEnviando(false)
    }
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget && !enviando) {
      alCerrar()
    }
  }

  const idTitulo = editando ? 'titulo-editar-cliente' : 'titulo-nuevo-cliente'

  return (
    <div className="fondo-dialogo-cliente" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-cliente"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <header className="encabezado-dialogo-cliente">
          <div>
            <p className="etiqueta-dialogo-cliente">Clientes</p>
            <h2 id={idTitulo}>{editando ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <p>Los campos marcados con * son obligatorios.</p>
          </div>
          <button
            className="boton-cerrar-dialogo-cliente"
            type="button"
            onClick={alCerrar}
            disabled={enviando}
            aria-label="Cerrar formulario"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="formulario-cliente" onSubmit={manejarEnvio} noValidate>
          <div className="campo-formulario-cliente">
            <label htmlFor="cliente-tipo">Tipo de cliente *</label>
            <select
              ref={campoInicialRef}
              id="cliente-tipo"
              name="tipo"
              value={formulario.tipo}
              onChange={actualizarCampo}
              disabled={enviando}
            >
              <option value="individual">Individual</option>
              <option value="empresa">Empresa</option>
            </select>
          </div>

          {formulario.tipo === 'individual' ? (
            <div className="campo-formulario-cliente">
              <label htmlFor="cliente-nombre">Nombre completo *</label>
              <input
                id="cliente-nombre"
                name="nombre_completo"
                value={formulario.nombre_completo}
                onChange={actualizarCampo}
                maxLength={150}
                disabled={enviando}
                aria-invalid={Boolean(errores.nombre_completo)}
              />
              {errores.nombre_completo && (
                <p className="error-campo-cliente">{errores.nombre_completo}</p>
              )}
            </div>
          ) : (
            <div className="campo-formulario-cliente">
              <label htmlFor="cliente-razon-social">Razón social *</label>
              <input
                id="cliente-razon-social"
                name="razon_social"
                value={formulario.razon_social}
                onChange={actualizarCampo}
                maxLength={200}
                disabled={enviando}
                aria-invalid={Boolean(errores.razon_social)}
              />
              {errores.razon_social && (
                <p className="error-campo-cliente">{errores.razon_social}</p>
              )}
            </div>
          )}

          <div className="campo-formulario-cliente">
            <label htmlFor="cliente-nit">NIT *</label>
            <input
              id="cliente-nit"
              name="nit"
              value={formulario.nit}
              onChange={actualizarCampo}
              maxLength={40}
              autoCapitalize="characters"
              disabled={enviando}
              aria-invalid={Boolean(errores.nit)}
            />
            <small>Se guardará sin espacios ni guiones.</small>
            {errores.nit && <p className="error-campo-cliente">{errores.nit}</p>}
          </div>

          <div className="campo-formulario-cliente">
            <label htmlFor="cliente-telefono">Teléfono</label>
            <input
              id="cliente-telefono"
              name="telefono"
              type="tel"
              value={formulario.telefono}
              onChange={actualizarCampo}
              maxLength={30}
              disabled={enviando}
              aria-invalid={Boolean(errores.telefono)}
            />
            {errores.telefono && (
              <p className="error-campo-cliente">{errores.telefono}</p>
            )}
          </div>

          <div className="campo-formulario-cliente campo-ancho-cliente">
            <label htmlFor="cliente-correo">Correo electrónico</label>
            <input
              id="cliente-correo"
              name="correo_electronico"
              type="email"
              value={formulario.correo_electronico}
              onChange={actualizarCampo}
              maxLength={254}
              autoCapitalize="none"
              disabled={enviando}
              aria-invalid={Boolean(errores.correo_electronico)}
            />
            {errores.correo_electronico && (
              <p className="error-campo-cliente">
                {errores.correo_electronico}
              </p>
            )}
          </div>

          <div className="campo-formulario-cliente campo-ancho-cliente">
            <label htmlFor="cliente-direccion">Dirección *</label>
            <textarea
              id="cliente-direccion"
              name="direccion"
              value={formulario.direccion}
              onChange={actualizarCampo}
              maxLength={500}
              rows={3}
              disabled={enviando}
              aria-invalid={Boolean(errores.direccion)}
            />
            {errores.direccion && (
              <p className="error-campo-cliente">{errores.direccion}</p>
            )}
          </div>

          {editando && (
            <label className="control-estado-cliente campo-ancho-cliente">
              <span>
                <strong>Cliente activo</strong>
                <small>Al desactivarlo se conserva todo su historial.</small>
              </span>
              <input
                name="activo"
                type="checkbox"
                checked={formulario.activo}
                onChange={actualizarCampo}
                disabled={enviando}
              />
            </label>
          )}

          {errorEnvio && (
            <p className="mensaje-error-clientes campo-ancho-cliente" role="alert">
              {errorEnvio}
            </p>
          )}

          <div className="acciones-dialogo-cliente campo-ancho-cliente">
            <button
              className="boton-secundario-cliente"
              type="button"
              onClick={alCerrar}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              className="boton-primario-cliente"
              type="submit"
              disabled={enviando}
            >
              {enviando
                ? 'Guardando...'
                : editando
                  ? 'Guardar cambios'
                  : 'Crear cliente'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ClienteDialog
