import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  PackagePlus,
  Save,
  X,
} from 'lucide-react'
import { actualizarVariante, crearVariante } from '../services/productos'
import {
  convertirACentimetros,
  obtenerUnidadLongitud,
  UNIDADES_LONGITUD,
} from '../utils/medidas'

const FORMULARIO_INICIAL = {
  codigo_sku: '',
  color: '',
  longitud_cm: '',
  unidad_longitud: 'cm',
  clasificacion: 'normal',
  observaciones: '',
  activo: true,
}

const crearFormulario = (variante) =>
  variante
    ? {
        codigo_sku: variante.codigo_sku,
        color: variante.color,
        longitud_cm: String(variante.longitud_cm),
        unidad_longitud: 'cm',
        clasificacion: variante.clasificacion,
        observaciones: variante.observaciones ?? '',
        activo: variante.activo,
      }
    : FORMULARIO_INICIAL

const obtenerMensajeError = (error, editando) => {
  if (error?.status === 409) {
    return 'Ya existe una variante con el mismo SKU o combinación comercial.'
  }
  if (error?.status === 403) {
    return `No tienes permiso para ${editando ? 'editar' : 'crear'} variantes.`
  }
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  if (error?.status === 404) return 'La variante solicitada ya no existe.'
  return `No fue posible ${editando ? 'actualizar' : 'crear'} la variante.`
}

function VarianteProductoDialog({
  variante,
  alCerrar,
  alGuardar,
  alRefrescarAutorizacion,
}) {
  const [formulario, setFormulario] = useState(() => crearFormulario(variante))
  const [errores, setErrores] = useState({})
  const [errorEnvio, setErrorEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [selectorUnidadAbierto, setSelectorUnidadAbierto] = useState(false)
  const [selectorClasificacionAbierto, setSelectorClasificacionAbierto] = useState(false)
  const campoInicialRef = useRef(null)
  const editando = Boolean(variante)

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => campoInicialRef.current?.focus(),
      0,
    )
    return () => window.clearTimeout(temporizador)
  }, [])

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape' && !enviando) alCerrar()
    }

    document.addEventListener('keydown', manejarTeclado)
    return () => {
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar, enviando])

  const actualizarCampo = (evento) => {
    const { checked, name, type, value } = evento.target
    setFormulario((actual) => ({
      ...actual,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setErrores((actuales) => ({ ...actuales, [name]: '' }))
    setErrorEnvio('')
  }

  const validar = () => {
    const nuevosErrores = {}
    const codigoSku = formulario.codigo_sku.trim().toUpperCase()
    const color = formulario.color.trim().replace(/\s+/g, ' ')
    const longitudCm = convertirACentimetros(
      formulario.longitud_cm,
      formulario.unidad_longitud,
    )
    const observaciones = formulario.observaciones.trim()

    if (
      codigoSku.length < 3 ||
      codigoSku.length > 80 ||
      !/^[A-Z0-9][A-Z0-9._-]*[A-Z0-9]$/.test(codigoSku)
    ) {
      nuevosErrores.codigo_sku =
        'Usa de 3 a 80 letras, números, puntos, guiones o guion bajo.'
    }
    if (!color || color.length > 80) {
      nuevosErrores.color = 'Ingresa un color de hasta 80 caracteres.'
    }
    if (longitudCm === null) {
      nuevosErrores.longitud_cm = `Ingresa una medida válida en ${obtenerUnidadLongitud(formulario.unidad_longitud).etiqueta}.`
    }
    if (observaciones.length > 500) {
      nuevosErrores.observaciones =
        'Las observaciones no pueden exceder 500 caracteres.'
    }

    setErrores(nuevosErrores)
    return {
      valido: Object.keys(nuevosErrores).length === 0,
      datos: {
        codigo_sku: codigoSku,
        color,
        longitud_cm: longitudCm,
        clasificacion: formulario.clasificacion,
        observaciones: observaciones || null,
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
      variante.activo &&
      !validacion.datos.activo &&
      !window.confirm(
        '¿Deseas desactivar esta variante? Su historial de precios se conservará.',
      )
    ) {
      return
    }

    setEnviando(true)
    setErrorEnvio('')

    try {
      const resultado = editando
        ? await actualizarVariante(variante.id, validacion.datos)
        : await crearVariante(validacion.datos)
      alGuardar(resultado.variante, editando)
    } catch (error) {
      setErrorEnvio(obtenerMensajeError(error, editando))
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion()
    } finally {
      setEnviando(false)
    }
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget && !enviando) alCerrar()
  }

  const idTitulo = editando ? 'titulo-editar-variante' : 'titulo-nueva-variante'

  return (
    <div className="fondo-dialogo-producto" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-producto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <header className="encabezado-dialogo-producto">
          <div>
            <p className="etiqueta-dialogo-producto">Snapdragon</p>
            <h2 id={idTitulo}>
              {editando ? 'Editar variante' : 'Nueva variante'}
            </h2>
            <p>Los campos marcados con * son obligatorios.</p>
          </div>
          <button
            className="boton-cerrar-dialogo-producto"
            type="button"
            onClick={alCerrar}
            disabled={enviando}
            aria-label="Cerrar formulario"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="formulario-producto" onSubmit={manejarEnvio} noValidate>
          <div className="campo-formulario-producto">
            <label htmlFor="variante-sku">SKU *</label>
            <input
              ref={campoInicialRef}
              id="variante-sku"
              name="codigo_sku"
              value={formulario.codigo_sku}
              onChange={actualizarCampo}
              placeholder="Ej. SNAP-AM-60-NOR"
              maxLength={80}
              autoCapitalize="characters"
              disabled={enviando}
              aria-invalid={Boolean(errores.codigo_sku)}
            />
            {errores.codigo_sku && (
              <p className="error-campo-producto">{errores.codigo_sku}</p>
            )}
          </div>

          <div className="campo-formulario-producto">
            <label htmlFor="variante-color">Color *</label>
            <input
              id="variante-color"
              name="color"
              value={formulario.color}
              onChange={actualizarCampo}
              placeholder="Ej. Amarillo"
              maxLength={80}
              disabled={enviando}
              aria-invalid={Boolean(errores.color)}
            />
            {errores.color && (
              <p className="error-campo-producto">{errores.color}</p>
            )}
          </div>

          <div className="campo-formulario-producto">
             <label htmlFor="variante-longitud">Longitud del tallo *</label>
             <div className="control-medida-producto">
               <input
                 id="variante-longitud"
                 name="longitud_cm"
                 type="number"
                 min="0.01"
                 step="0.01"
                  value={formulario.longitud_cm}
                  onChange={actualizarCampo}
                  placeholder="Ej. 60"
                  disabled={enviando}
                 aria-invalid={Boolean(errores.longitud_cm)}
               />
                <div className="selector-formulario-producto">
                  <button
                  className="boton-selector-formulario-producto"
                  type="button"
                  onClick={() => setSelectorUnidadAbierto((abierto) => !abierto)}
                  disabled={enviando}
                  aria-label="Unidad de longitud"
                  aria-expanded={selectorUnidadAbierto}
                  aria-haspopup="listbox"
                  >
                    {formulario.unidad_longitud}
                    <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
                  </button>
                  {selectorUnidadAbierto && (
                    <div className="lista-formulario-producto" role="listbox" aria-label="Selecciona una unidad">
                      {UNIDADES_LONGITUD.map((unidad) => (
                        <button
                          key={unidad.valor}
                          type="button"
                          role="option"
                          aria-selected={unidad.valor === formulario.unidad_longitud}
                          onClick={() => {
                            actualizarCampo({ target: { name: 'unidad_longitud', value: unidad.valor } })
                            setSelectorUnidadAbierto(false)
                          }}
                        >
                          {unidad.valor}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
             </div>
            {errores.longitud_cm && (
              <p className="error-campo-producto">{errores.longitud_cm}</p>
            )}
          </div>

          <div className="campo-formulario-producto">
            <label htmlFor="variante-clasificacion">Clasificación *</label>
             <div className="selector-formulario-producto selector-clasificacion-formulario-producto">
               <button
               id="variante-clasificacion"
               className="boton-selector-formulario-producto"
               type="button"
               onClick={() => setSelectorClasificacionAbierto((abierto) => !abierto)}
               disabled={enviando}
               aria-expanded={selectorClasificacionAbierto}
               aria-haspopup="listbox"
               >
                 {{ normal: 'Normal', completa: 'Completa', premium: 'Premium' }[formulario.clasificacion]}
                 <ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
               </button>
               {selectorClasificacionAbierto && (
                 <div className="lista-formulario-producto" role="listbox" aria-label="Selecciona una clasificación">
                   {[
                     ['normal', 'Normal'],
                     ['completa', 'Completa'],
                     ['premium', 'Premium'],
                   ].map(([valor, etiqueta]) => (
                     <button
                       key={valor}
                       type="button"
                       role="option"
                       aria-selected={valor === formulario.clasificacion}
                       onClick={() => {
                         actualizarCampo({ target: { name: 'clasificacion', value: valor } })
                         setSelectorClasificacionAbierto(false)
                       }}
                     >
                       {etiqueta}
                     </button>
                   ))}
                 </div>
               )}
             </div>
          </div>

          <div className="campo-formulario-producto campo-ancho-producto">
            <label htmlFor="variante-observaciones">Observaciones</label>
            <textarea
              id="variante-observaciones"
              name="observaciones"
              value={formulario.observaciones}
              onChange={actualizarCampo}
              placeholder="Información adicional de la variante"
              maxLength={500}
              rows={3}
              disabled={enviando}
              aria-invalid={Boolean(errores.observaciones)}
            />
            {errores.observaciones && (
              <p className="error-campo-producto">{errores.observaciones}</p>
            )}
          </div>

          {editando && (
            <label className="control-estado-producto campo-ancho-producto">
              <span>
                <strong>Variante activa</strong>
                <small>Al desactivarla se conserva su historial.</small>
              </span>
              <input
                name="activo"
                type="checkbox"
                checked={formulario.activo}
                onChange={(evento) => {
                  if (!evento.target.checked && !window.confirm('¿Estás seguro que deseas desactivarla?')) {
                    return
                  }
                  actualizarCampo(evento)
                }}
                disabled={enviando}
              />
              <AlertTriangle size={22} strokeWidth={2} aria-hidden="true" />
            </label>
          )}

          {errorEnvio && (
            <p className="mensaje-error-productos campo-ancho-producto" role="alert">
              {errorEnvio}
            </p>
          )}

          <div className="acciones-dialogo-producto campo-ancho-producto">
            <button
              className="boton-secundario-producto"
              type="button"
              onClick={alCerrar}
              disabled={enviando}
            >
              <X size={17} strokeWidth={2} aria-hidden="true" />
              Cancelar
            </button>
            <button
              className="boton-primario-producto"
              type="submit"
              disabled={enviando}
            >
               {!enviando && !editando && <PackagePlus size={17} strokeWidth={2} aria-hidden="true" />}
               {!enviando && editando && <Save size={17} strokeWidth={2} aria-hidden="true" />}
               {enviando
                ? 'Guardando...'
                : editando
                  ? 'Guardar cambios'
                  : 'Crear variante'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default VarianteProductoDialog
