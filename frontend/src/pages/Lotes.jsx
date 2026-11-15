import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, PackagePlus, RefreshCw, Search } from 'lucide-react'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import { listarVariantes } from '../services/productos'
import {
  crearLote,
  listarLotesOperativos,
  listarProveedoresOperativos,
  registrarCalidadLote,
  generarQrLote,
} from '../services/operaciones'
import { convertirACentimetros, obtenerUnidadLongitud, UNIDADES_LONGITUD } from '../utils/medidas'
import './Lotes.css'

const FORMULARIO_INICIAL = {
  codigo: '',
  origen: 'compra',
  proveedor_id: '',
  variante_id: '',
  fecha_origen: new Date().toISOString().slice(0, 10),
  fecha_recepcion: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  variedad: '',
  color: '',
  longitud_cm: '',
  unidad_longitud: 'cm',
  calidad: 'pendiente',
  cantidad_inicial: '',
  cantidad_disponible: '',
  costo_unitario: '',
  estado: 'cuarentena',
  observaciones: '',
}

const formatoFecha = (valor) => valor
  ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(`${valor}T12:00:00`))
  : '—'

function ListaPersonalizada({ name, value, onChange, opciones, placeholder, required = false, ariaLabel }) {
  const [abierta, setAbierta] = useState(false)
  const referencia = useRef(null)
  const opcionSeleccionada = opciones.find((opcion) => opcion.value === value)

  useEffect(() => {
    const cerrar = (evento) => {
      if (!referencia.current?.contains(evento.target)) setAbierta(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  return (
    <div className="lista-personalizada-lotes" ref={referencia}>
      <input type="hidden" name={name} value={value} required={required} />
       <button className="disparador-lista-lotes" type="button" aria-label={ariaLabel} aria-required={required} aria-haspopup="listbox" aria-expanded={abierta} onClick={() => setAbierta((actual) => !actual)}>
        <span>{opcionSeleccionada?.label ?? placeholder}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {abierta && <div className="opciones-lista-lotes" role="listbox" aria-label={name}>
        {opciones.map((opcion) => <button className="opcion-lista-lotes" type="button" role="option" aria-selected={opcion.value === value} key={opcion.value} onClick={() => { onChange(opcion.value); setAbierta(false) }}>{opcion.label}</button>)}
      </div>}
    </div>
  )
}

function Lotes({ permisos, alRefrescarAutorizacion }) {
  const puedeAdministrar = permisos.includes('lote.administrar')
  const puedeRegistrarCalidad = permisos.includes('calidad.registrar')
  const [lotes, setLotes] = useState([])
  const [variantes, setVariantes] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [loteCalidad, setLoteCalidad] = useState(null)
  const [resultadoCalidad, setResultadoCalidad] = useState('aprobado')
  const [observacionesCalidad, setObservacionesCalidad] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [qrGenerado, setQrGenerado] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const elementosPorPagina = 10

  useEffect(() => {
    const temporizador = window.setTimeout(() => setBusquedaAplicada(busqueda.trim().toLowerCase()), 1000)
    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const cargar = useCallback(async () => {
    try {
      const consultas = [listarLotesOperativos()]
      if (puedeAdministrar) {
        consultas.push(listarVariantes({ pagina: 1, limite: 100, activo: true }))
        consultas.push(listarProveedoresOperativos())
      }
      const [lotesResultado, variantesResultado, proveedoresResultado] = await Promise.all(consultas)
      setLotes(lotesResultado)
      setVariantes(variantesResultado?.variantes ?? [])
      setProveedores(proveedoresResultado ?? [])
    } catch (errorCarga) {
      setError(errorCarga?.status === 403
        ? 'Tu perfil no tiene permiso para consultar lotes.'
        : 'No fue posible cargar los lotes.')
      if ([401, 403].includes(errorCarga?.status)) alRefrescarAutorizacion?.()
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, puedeAdministrar])

  useEffect(() => {
    const temporizador = window.setTimeout(() => cargar(), 0)
    return () => window.clearTimeout(temporizador)
  }, [cargar])

  const variantesDisponibles = useMemo(
    () => variantes.map((variante) => ({
      ...variante,
      etiqueta: `${variante.codigo_sku} · ${variante.color} · ${variante.longitud_cm} cm`,
    })),
    [variantes],
  )

  const lotesFiltrados = useMemo(() => {
    if (!busquedaAplicada) return lotes
    return lotes.filter((lote) => [
      lote.codigo, lote.origen, lote.calidad, lote.estado, lote.variante_id,
    ].some((valor) => String(valor ?? '').toLowerCase().includes(busquedaAplicada)))
  }, [busquedaAplicada, lotes])
  const totalPaginas = Math.max(1, Math.ceil(lotesFiltrados.length / elementosPorPagina))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const lotesVisibles = lotesFiltrados.slice((paginaSegura - 1) * elementosPorPagina, paginaSegura * elementosPorPagina)

  const cambiarCampo = (evento) => {
    const { name, value } = evento.target
    setFormulario((actual) => ({ ...actual, [name]: value }))
  }

  const cambiarUnidadLongitud = (nuevaUnidad) => {
    const valorActual = Number(formulario.longitud_cm)
    if (!Number.isFinite(valorActual) || valorActual <= 0) {
      setFormulario((actual) => ({ ...actual, unidad_longitud: nuevaUnidad }))
      return
    }

    const centimetros = valorActual * obtenerUnidadLongitud(formulario.unidad_longitud).factorCm
    const valorConvertido = centimetros / obtenerUnidadLongitud(nuevaUnidad).factorCm
    const valorRedondeado = Math.round(valorConvertido * 10000) / 10000

    setFormulario((actual) => ({
      ...actual,
      longitud_cm: String(valorRedondeado),
      unidad_longitud: nuevaUnidad,
    }))
  }

  const seleccionarVariante = (evento) => {
    const variante = variantes.find((item) => item.id === evento.target.value)
    setFormulario((actual) => ({
      ...actual,
      variante_id: evento.target.value,
      color: variante?.color ?? actual.color,
      longitud_cm: variante?.longitud_cm ?? actual.longitud_cm,
    }))
  }

  const enviarLote = async (evento) => {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const { unidad_longitud, ...datosFormulario } = formulario
      const longitudCentimetros = convertirACentimetros(formulario.longitud_cm, unidad_longitud)
      await crearLote({
        ...datosFormulario,
        proveedor_id: formulario.origen === 'compra' ? formulario.proveedor_id : null,
        variante_id: formulario.variante_id || null,
        fecha_vencimiento: formulario.fecha_vencimiento || null,
        longitud_cm: longitudCentimetros,
        cantidad_inicial: Number(formulario.cantidad_inicial),
        cantidad_disponible: Number(formulario.cantidad_disponible || formulario.cantidad_inicial),
        costo_unitario: Number(formulario.costo_unitario || 0),
      })
      setFormulario(FORMULARIO_INICIAL)
      setMensaje('Lote creado en cuarentena. Registra su calidad para liberarlo.')
      await cargar()
    } catch (errorGuardado) {
      setError(errorGuardado?.status === 409 ? 'El código del lote ya existe.' : 'No fue posible crear el lote.')
    } finally {
      setGuardando(false)
    }
  }

  const enviarCalidad = async (evento) => {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await registrarCalidadLote({
        lote_id: loteCalidad.id,
        resultado: resultadoCalidad,
        observaciones: observacionesCalidad || null,
        evidencia_url: null,
      })
      setLoteCalidad(null)
      setObservacionesCalidad('')
      setMensaje('La inspección de calidad fue registrada.')
      await cargar()
    } catch {
      setError('No fue posible registrar la inspección de calidad.')
    } finally {
      setGuardando(false)
    }
  }

  const crearQr = async (lote) => {
    setError('')
    try {
      setQrGenerado(await generarQrLote(lote.id))
    } catch (errorQr) {
      setError(errorQr?.status === 409 ? 'Este lote ya tiene un QR activo.' : 'No fue posible generar el QR del lote.')
    }
  }

  return (
    <div className="pagina-lotes">
      <header className="encabezado-pagina-lotes">
        <div>
          <span className="eyebrow-pagina-lotes">Operación · trazabilidad</span>
          <h1>Lotes</h1>
          <p>Controla el origen, calidad y saldo que utiliza el costeo FIFO.</p>
        </div>
        <div className="resumen-lotes">
          <strong>{lotes.length}</strong>
          <span>lotes registrados</span>
        </div>
      </header>

      {error && <div className="alerta-lotes alerta-lotes-error">{error}</div>}
      {mensaje && <div className="alerta-lotes alerta-lotes-exito">{mensaje}</div>}
      {qrGenerado && <div className="alerta-lotes alerta-lotes-exito"><strong>QR generado para {qrGenerado.codigo}.</strong><br /><a href={qrGenerado.url} target="_blank" rel="noreferrer">Abrir trazabilidad pública</a><button className="boton-cerrar-aviso-lotes" type="button" onClick={() => setQrGenerado(null)}>Cerrar</button></div>}

      {puedeAdministrar && (
        <section className="panel-lotes panel-formulario-lotes">
          <div className="titulo-panel-lotes">
            <div><span className="eyebrow-pagina-lotes">Nueva entrada</span><h2>Crear lote</h2></div>
            <span>El lote inicia en cuarentena</span>
          </div>
          <form className="formulario-lotes" onSubmit={enviarLote}>
             <label><span className="label-campo-lotes">Código del lote <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="codigo" value={formulario.codigo} onChange={cambiarCampo} required aria-required="true" maxLength="50" placeholder="ROS-2026-001" /></label>
             <label><span className="label-campo-lotes">Origen <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><ListaPersonalizada name="origen" value={formulario.origen} onChange={(valor) => setFormulario((actual) => ({ ...actual, origen: valor }))} opciones={[{ value: 'compra', label: 'Compra' }, { value: 'produccion', label: 'Producción' }]} placeholder="Selecciona un origen" required ariaLabel="Origen" /></label>
             <label><span className="label-campo-lotes">Variante <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><ListaPersonalizada name="variante_id" value={formulario.variante_id} onChange={(valor) => seleccionarVariante({ target: { value: valor } })} opciones={[{ value: '', label: 'Selecciona una variante' }, ...variantesDisponibles.map((variante) => ({ value: variante.id, label: variante.etiqueta }))]} placeholder="Selecciona una variante" required ariaLabel="Variante" /></label>
             {formulario.origen === 'compra' && <label><span className="label-campo-lotes">Proveedor <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><ListaPersonalizada name="proveedor_id" value={formulario.proveedor_id} onChange={(valor) => setFormulario((actual) => ({ ...actual, proveedor_id: valor }))} opciones={[{ value: '', label: 'Selecciona un proveedor' }, ...proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre }))]} placeholder="Selecciona un proveedor" required ariaLabel="Proveedor" /></label>}
             <label><span className="label-campo-lotes">Variedad <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="variedad" value={formulario.variedad} onChange={cambiarCampo} required aria-required="true" placeholder="Rosa Freedom" /></label>
             <label><span className="label-campo-lotes">Color <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="color" value={formulario.color} onChange={cambiarCampo} required aria-required="true" /></label>
              <label><span className="label-campo-lotes">Longitud ({formulario.unidad_longitud}) <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><div className="control-medida-lotes"><input name="longitud_cm" type="number" min="0.01" step="0.01" value={formulario.longitud_cm} onChange={cambiarCampo} required aria-required="true" /><ListaPersonalizada name="unidad_longitud" value={formulario.unidad_longitud} onChange={cambiarUnidadLongitud} opciones={UNIDADES_LONGITUD.map((unidad) => ({ value: unidad.valor, label: unidad.valor }))} placeholder="Unidad" ariaLabel="Unidad de longitud" /></div></label>
             <label><span className="label-campo-lotes">Fecha de origen <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="fecha_origen" type="date" value={formulario.fecha_origen} onChange={cambiarCampo} required aria-required="true" /></label>
             <label><span className="label-campo-lotes">Fecha de recepción</span><input name="fecha_recepcion" type="date" value={formulario.fecha_recepcion} onChange={cambiarCampo} /></label>
             <label><span className="label-campo-lotes">Vencimiento</span><input name="fecha_vencimiento" type="date" value={formulario.fecha_vencimiento} onChange={cambiarCampo} /></label>
              <label><span className="label-campo-lotes">Cantidad inicial <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="cantidad_inicial" type="number" min="1" value={formulario.cantidad_inicial} onChange={cambiarCampo} required aria-required="true" /></label>
              <label><span className="label-campo-lotes">Costo por manojo <span className="campo-obligatorio-lotes" aria-hidden="true">*</span></span><input name="costo_unitario" type="number" min="0" step="0.0001" value={formulario.costo_unitario} onChange={cambiarCampo} required aria-required="true" /></label>
             <label className="campo-largo-lotes"><span className="label-campo-lotes">Observaciones</span><textarea name="observaciones" value={formulario.observaciones} onChange={cambiarCampo} maxLength="1000" rows="2" /></label>
             <div className="acciones-formulario-lotes"><button className="boton-principal-lotes" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : <><PackagePlus size={16} aria-hidden="true" />Crear lote</>}</button></div>
          </form>
        </section>
      )}

      <section className="panel-lotes">
          <div className="titulo-panel-lotes"><div><span className="eyebrow-pagina-lotes">Inventario trazable</span><h2>Lotes disponibles</h2></div><button className="boton-secundario-lotes" type="button" onClick={() => { setCargando(true); cargar() }}><RefreshCw size={15} aria-hidden="true" />Actualizar</button></div>
          <div className="barra-listado-lotes"><label className="busqueda-lotes"><Search size={16} aria-hidden="true" /><span className="texto-solo-lectores">Buscar lotes</span><input value={busqueda} onChange={(evento) => { setBusqueda(evento.target.value); setPagina(1) }} placeholder="Buscar por código, origen o estado" /></label><span className="contador-listado-lotes">{lotesFiltrados.length} resultados</span></div>
          {cargando ? <p className="estado-vacio-lotes">Cargando lotes...</p> : lotesFiltrados.length === 0 ? <p className="estado-vacio-lotes">{lotes.length ? 'No hay lotes que coincidan con la búsqueda.' : 'Todavía no hay lotes registrados.'}</p> : (
            <><div className="tabla-lotes-scroll"><table className="tabla-lotes"><thead><tr><th>Lote</th><th>Variante</th><th>Origen</th><th>Origen fecha</th><th>Calidad</th><th>Saldo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{lotesVisibles.map((lote) => <tr key={lote.id}><td><strong>{lote.codigo}</strong></td><td>{lote.variante_id ? (variantes.find((item) => item.id === lote.variante_id)?.codigo_sku ?? lote.variante_id.slice(0, 8)) : 'Sin variante'}</td><td>{lote.origen ?? '—'}</td><td>{formatoFecha(lote.fecha_origen)}</td><td>{lote.calidad ?? 'Pendiente'}</td><td>{lote.cantidad_disponible}</td><td><EstadoEtiqueta tono={lote.estado === 'liberado' ? 'positivo' : lote.estado === 'rechazado' ? 'peligro' : 'advertencia'}>{lote.estado}</EstadoEtiqueta></td><td>{puedeRegistrarCalidad && ['cuarentena', 'liberado'].includes(lote.estado) && <button className="boton-link-lotes" type="button" onClick={() => setLoteCalidad(lote)}>Registrar calidad</button>}{puedeAdministrar && <button className="boton-link-lotes" type="button" onClick={() => crearQr(lote)}>Generar QR</button>}</td></tr>)}</tbody></table></div><div className="paginacion-lotes"><button type="button" className="boton-paginacion-lotes" onClick={() => setPagina((actual) => actual - 1)} disabled={paginaSegura === 1} aria-label="Página anterior"><ChevronLeft size={17} /></button><span>Página {paginaSegura} de {totalPaginas}</span><button type="button" className="boton-paginacion-lotes" onClick={() => setPagina((actual) => actual + 1)} disabled={paginaSegura === totalPaginas} aria-label="Página siguiente"><ChevronRight size={17} /></button></div></>
          )}
      </section>

       {loteCalidad && <div className="capa-modal-lotes"><form className="modal-lotes" onSubmit={enviarCalidad}><span className="eyebrow-pagina-lotes">Inspección · {loteCalidad.codigo}</span><h2>Registrar calidad</h2><label>Resultado<ListaPersonalizada name="resultado-calidad" value={resultadoCalidad} onChange={setResultadoCalidad} opciones={[{ value: 'aprobado', label: 'Aprobado y liberar' }, { value: 'observado', label: 'Observado' }, { value: 'rechazado', label: 'Rechazado' }]} placeholder="Selecciona un resultado" /></label><label>Observaciones<textarea value={observacionesCalidad} onChange={(evento) => setObservacionesCalidad(evento.target.value)} rows="4" maxLength="1000" /></label><div className="acciones-modal-lotes"><button className="boton-secundario-lotes" type="button" onClick={() => setLoteCalidad(null)}>Cancelar</button><button className="boton-principal-lotes" type="submit" disabled={guardando}>Guardar inspección</button></div></form></div>}
    </div>
  )
}

export default Lotes
