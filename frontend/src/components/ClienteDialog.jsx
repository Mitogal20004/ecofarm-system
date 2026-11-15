import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Save, UserPlus, X } from 'lucide-react'
import { actualizarCliente, crearCliente } from '../services/clientes'
import {
  obtenerUrlBandera,
  PAISES_TELEFONO,
  separarTelefono,
} from '../utils/telefono'

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
const obtenerErrorCorreo = (valor) => {
  const correo = valor.trim()
  return correo && (correo.length > 254 || !PATRON_EMAIL.test(correo))
    ? 'Ingresa un correo válido.'
    : ''
}

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

function ClienteDialog({
  abierto,
  cliente,
  alCerrar,
  alGuardar,
  alRefrescarAutorizacion,
}) {
  const [formulario, setFormulario] = useState(() => crearFormulario(cliente))
  const [errores, setErrores] = useState({})
  const [errorEnvio, setErrorEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const telefonoInicial = separarTelefono(formulario.telefono)
  const [paisTelefono, setPaisTelefono] = useState(telefonoInicial.codigo)
  const [telefono, setTelefono] = useState(telefonoInicial.local)
  const [selectorTipoAbierto, setSelectorTipoAbierto] = useState(false)
  const [selectorPaisAbierto, setSelectorPaisAbierto] = useState(false)
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
    const telefonoNormalizado = telefono.replace(/\D/g, '')
    const telefonoCompleto = telefonoNormalizado
      ? `${paisTelefono}${telefonoNormalizado}`
      : ''
    const correoElectronico = formulario.correo_electronico
      .trim()
      .toLowerCase()
    const direccion = formulario.direccion.trim().replace(/\s+/g, ' ')
    const reglasNit = PAISES_TELEFONO.find((pais) => pais.codigo === paisTelefono) ?? PAISES_TELEFONO[0]
    const nitTieneFormatoValido = reglasNit.nitNumerico
      ? /^\d+$/.test(nit)
      : /^[A-Z0-9]+$/.test(nit)

    if (formulario.tipo === 'individual' && !nombreCompleto) {
      nuevosErrores.nombre_completo = 'Ingresa el nombre completo.'
    }

    if (formulario.tipo === 'empresa' && !razonSocial) {
      nuevosErrores.razon_social = 'Ingresa la razón social.'
    }

    if (!nit) {
      nuevosErrores.nit = 'Ingresa el NIT.'
    } else if (nit.length < reglasNit.nitMin) {
      nuevosErrores.nit = `El NIT debe tener mínimo ${reglasNit.nitMin} ${reglasNit.nitNumerico ? 'dígitos' : 'caracteres'}.`
    } else if (nit.length > reglasNit.nitMax) {
      nuevosErrores.nit = `El NIT no puede superar ${reglasNit.nitMax} ${reglasNit.nitNumerico ? 'dígitos' : 'caracteres'}.`
    } else if (!nitTieneFormatoValido) {
      nuevosErrores.nit = reglasNit.nitNumerico
        ? 'El NIT solo puede contener números.'
        : 'El NIT solo puede contener letras y números.'
    }

    if (telefonoNormalizado && telefonoNormalizado.length < 7) {
      nuevosErrores.telefono = 'El teléfono debe tener mínimo 7 dígitos.'
    } else if (telefonoNormalizado.length > 15) {
      nuevosErrores.telefono = 'El teléfono no puede superar 15 dígitos.'
    }

    nuevosErrores.correo_electronico = obtenerErrorCorreo(correoElectronico)

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
        telefono: telefonoCompleto || null,
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

    setEnviando(true)
    setErrorEnvio('')

    try {
      const resultado = editando
        ? await actualizarCliente(cliente.id, validacion.datos)
        : await crearCliente(validacion.datos)

      alGuardar(resultado.cliente, editando)
    } catch (error) {
      setErrorEnvio(obtenerMensajeError(error, editando))

      if ([401, 403].includes(error?.status)) {
        alRefrescarAutorizacion()
      }
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
  const paisSeleccionado = PAISES_TELEFONO.find((pais) => pais.codigo === paisTelefono) ?? PAISES_TELEFONO[0]
  const cantidadDigitosTelefono = telefono.replace(/\D/g, '').length
  const mensajeTelefono = cantidadDigitosTelefono > 15
    ? 'El número no puede superar los 15 dígitos.'
    : cantidadDigitosTelefono > 0 && cantidadDigitosTelefono < 7
      ? `Aún faltan ${7 - cantidadDigitosTelefono} dígitos.`
      : ''
  const nitNormalizado = formulario.nit.trim().toUpperCase().replace(/[\s-]+/g, '')
  const mensajeNit = !nitNormalizado
    ? ''
    : nitNormalizado.length < paisSeleccionado.nitMin
      ? `Aún faltan ${paisSeleccionado.nitMin - nitNormalizado.length} ${paisSeleccionado.nitNumerico ? 'dígitos' : 'caracteres'}.`
      : nitNormalizado.length > paisSeleccionado.nitMax
        ? `El NIT no puede superar ${paisSeleccionado.nitMax} ${paisSeleccionado.nitNumerico ? 'dígitos' : 'caracteres'}.`
        : paisSeleccionado.nitNumerico && !/^\d+$/.test(nitNormalizado)
          ? 'El NIT solo puede contener números.'
          : !paisSeleccionado.nitNumerico && !/^[A-Z0-9]+$/.test(nitNormalizado)
            ? 'El NIT solo puede contener letras y números.'
            : ''

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
            <div className="selector-tipo-cliente">
              <button
                ref={campoInicialRef}
                id="cliente-tipo"
                className="boton-selector-tipo-cliente"
                type="button"
                onClick={() => setSelectorTipoAbierto((abierto) => !abierto)}
                onBlur={() => window.setTimeout(() => setSelectorTipoAbierto(false), 0)}
                aria-haspopup="listbox"
                aria-expanded={selectorTipoAbierto}
                disabled={enviando}
              >
                {formulario.tipo === 'individual' ? 'Individual' : 'Empresa'}
                <span aria-hidden="true">⌄</span>
              </button>
              {selectorTipoAbierto && (
                <div className="lista-tipos-cliente" role="listbox" aria-label="Tipo de cliente">
                  {[
                    ['individual', 'Individual'],
                    ['empresa', 'Empresa'],
                  ].map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      role="option"
                      aria-selected={formulario.tipo === valor}
                      onMouseDown={(evento) => evento.preventDefault()}
                      onClick={() => {
                        actualizarCampo({ target: { name: 'tipo', type: 'select-one', value: valor } })
                        setSelectorTipoAbierto(false)
                      }}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              maxLength={paisSeleccionado.nitMax}
              inputMode={paisSeleccionado.nitNumerico ? 'numeric' : 'text'}
              autoCapitalize="characters"
              disabled={enviando}
              aria-invalid={Boolean(errores.nit || mensajeNit)}
              aria-describedby="ayuda-nit-cliente"
            />
            <small
              id="ayuda-nit-cliente"
              className={mensajeNit ? 'ayuda-nit-cliente-error' : undefined}
              role={mensajeNit ? 'alert' : undefined}
            >
              {mensajeNit || `Formato para ${paisSeleccionado.nombre}: ${paisSeleccionado.nitMin}-${paisSeleccionado.nitMax} ${paisSeleccionado.nitNumerico ? 'dígitos' : 'caracteres'}.`}
            </small>
            {errores.nit && <p className="error-campo-cliente">{errores.nit}</p>}
          </div>

          <div className="campo-formulario-cliente">
            <label htmlFor="cliente-telefono">Teléfono</label>
            <div className="telefono-cliente-control">
              <div className="selector-pais-cliente">
                <button
                  id="pais-telefono-cliente"
                  className="boton-selector-pais-cliente"
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
                  <div className="lista-paises-cliente" role="listbox" aria-label="Selecciona un país">
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
                id="cliente-telefono"
                name="telefono"
                type="tel"
                value={telefono}
                onChange={(evento) => {
                  setTelefono(evento.target.value.replace(/\D/g, ''))
                  setErrores((actuales) => ({ ...actuales, telefono: '' }))
                  setErrorEnvio('')
                }}
                maxLength={15}
                disabled={enviando}
                aria-invalid={Boolean(errores.telefono || mensajeTelefono)}
                aria-describedby="ayuda-telefono-cliente"
              />
            </div>
            <span
              id="ayuda-telefono-cliente"
              className={`ayuda-telefono-cliente${mensajeTelefono ? ' ayuda-telefono-cliente-error' : ''}`}
              role={mensajeTelefono ? 'alert' : undefined}
            >
              {mensajeTelefono || `Se guardará como ${paisTelefono}${telefono || 'XXXXXXXX'}`}
            </span>
            {errores.telefono && <p className="error-campo-cliente">{errores.telefono}</p>}
          </div>

          <div className="campo-formulario-cliente campo-ancho-cliente">
            <label htmlFor="cliente-correo">Correo electrónico</label>
            <input
              id="cliente-correo"
              name="correo_electronico"
              type="email"
              value={formulario.correo_electronico}
              onChange={actualizarCampo}
              onBlur={(evento) => setErrores((actuales) => ({ ...actuales, correo_electronico: obtenerErrorCorreo(evento.target.value) }))}
              maxLength={254}
              autoCapitalize="none"
              disabled={enviando}
              aria-invalid={Boolean(errores.correo_electronico)}
              aria-describedby={errores.correo_electronico ? 'error-cliente-correo' : undefined}
            />
            {errores.correo_electronico && (
              <p id="error-cliente-correo" className="error-campo-cliente" role="alert">
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
            <div className={`control-estado-cliente campo-ancho-cliente${formulario.activo ? '' : ' cliente-inactivo'}`}>
              <span>
                <strong>{formulario.activo ? 'Cliente activo' : 'Cliente inactivo'}</strong>
                <small>{formulario.activo ? 'Puedes desactivarlo si ya no debe aparecer como cliente activo.' : 'Este cliente está desactivado y conserva todo su historial.'}</small>
              </span>
              {formulario.activo && (
                <button
                  className="boton-desactivar-cliente"
                  type="button"
                  onClick={() => {
                    if (!window.confirm('¿Estás seguro de que deseas desactivar este cliente? Su historial se conservará.')) return
                    actualizarCampo({ target: { name: 'activo', type: 'checkbox', checked: false, value: '' } })
                  }}
                  disabled={enviando}
                >
                  <AlertTriangle size={16} strokeWidth={2.1} aria-hidden="true" />
                  Desactivar cliente
                </button>
              )}
            </div>
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
              <X size={16} strokeWidth={2.1} aria-hidden="true" />
              Cancelar
            </button>
            <button
              className="boton-primario-cliente"
              type="submit"
              disabled={enviando}
            >
              {editando ? <Save size={16} strokeWidth={2.1} aria-hidden="true" /> : <UserPlus size={16} strokeWidth={2.1} aria-hidden="true" />}
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
