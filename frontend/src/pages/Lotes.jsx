import { useCallback, useEffect, useMemo, useState } from 'react'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import { listarVariantes } from '../services/productos'
import {
  crearLote,
  listarLotesOperativos,
  listarProveedoresOperativos,
  registrarCalidadLote,
  generarQrLote,
} from '../services/operaciones'
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

  const cambiarCampo = (evento) => {
    const { name, value } = evento.target
    setFormulario((actual) => ({ ...actual, [name]: value }))
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
      await crearLote({
        ...formulario,
        proveedor_id: formulario.origen === 'compra' ? formulario.proveedor_id : null,
        variante_id: formulario.variante_id || null,
        fecha_vencimiento: formulario.fecha_vencimiento || null,
        longitud_cm: Number(formulario.longitud_cm),
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
            <label>Código del lote<input name="codigo" value={formulario.codigo} onChange={cambiarCampo} required maxLength="50" placeholder="ROS-2026-001" /></label>
            <label>Origen<select name="origen" value={formulario.origen} onChange={cambiarCampo}><option value="compra">Compra</option><option value="produccion">Producción</option></select></label>
            <label>Variante<select name="variante_id" value={formulario.variante_id} onChange={seleccionarVariante} required><option value="">Selecciona una variante</option>{variantesDisponibles.map((variante) => <option value={variante.id} key={variante.id}>{variante.etiqueta}</option>)}</select></label>
            {formulario.origen === 'compra' && <label>Proveedor<select name="proveedor_id" value={formulario.proveedor_id} onChange={cambiarCampo} required><option value="">Selecciona un proveedor</option>{proveedores.map((proveedor) => <option value={proveedor.id} key={proveedor.id}>{proveedor.nombre}</option>)}</select></label>}
            <label>Variedad<input name="variedad" value={formulario.variedad} onChange={cambiarCampo} required placeholder="Rosa Freedom" /></label>
            <label>Color<input name="color" value={formulario.color} onChange={cambiarCampo} required /></label>
            <label>Longitud (cm)<input name="longitud_cm" type="number" min="1" value={formulario.longitud_cm} onChange={cambiarCampo} required /></label>
            <label>Fecha de origen<input name="fecha_origen" type="date" value={formulario.fecha_origen} onChange={cambiarCampo} required /></label>
            <label>Fecha de recepción<input name="fecha_recepcion" type="date" value={formulario.fecha_recepcion} onChange={cambiarCampo} /></label>
            <label>Vencimiento<input name="fecha_vencimiento" type="date" value={formulario.fecha_vencimiento} onChange={cambiarCampo} /></label>
            <label>Cantidad inicial<input name="cantidad_inicial" type="number" min="1" value={formulario.cantidad_inicial} onChange={cambiarCampo} required /></label>
            <label>Costo por manojo<input name="costo_unitario" type="number" min="0" step="0.0001" value={formulario.costo_unitario} onChange={cambiarCampo} required /></label>
            <label className="campo-largo-lotes">Observaciones<textarea name="observaciones" value={formulario.observaciones} onChange={cambiarCampo} maxLength="1000" rows="2" /></label>
            <div className="acciones-formulario-lotes"><button className="boton-principal-lotes" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Crear lote'}</button></div>
          </form>
        </section>
      )}

      <section className="panel-lotes">
        <div className="titulo-panel-lotes"><div><span className="eyebrow-pagina-lotes">Inventario trazable</span><h2>Lotes disponibles</h2></div><button className="boton-secundario-lotes" type="button" onClick={() => { setCargando(true); cargar() }}>Actualizar</button></div>
        {cargando ? <p className="estado-vacio-lotes">Cargando lotes...</p> : lotes.length === 0 ? <p className="estado-vacio-lotes">Todavía no hay lotes registrados.</p> : (
          <div className="tabla-lotes-scroll"><table className="tabla-lotes"><thead><tr><th>Lote</th><th>Variante</th><th>Origen</th><th>Origen fecha</th><th>Calidad</th><th>Saldo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{lotes.map((lote) => <tr key={lote.id}><td><strong>{lote.codigo}</strong></td><td>{lote.variante_id ? (variantes.find((item) => item.id === lote.variante_id)?.codigo_sku ?? lote.variante_id.slice(0, 8)) : 'Sin variante'}</td><td>{lote.origen ?? '—'}</td><td>{formatoFecha(lote.fecha_origen)}</td><td>{lote.calidad ?? 'Pendiente'}</td><td>{lote.cantidad_disponible}</td><td><EstadoEtiqueta tono={lote.estado === 'liberado' ? 'positivo' : lote.estado === 'rechazado' ? 'peligro' : 'advertencia'}>{lote.estado}</EstadoEtiqueta></td><td>{puedeRegistrarCalidad && ['cuarentena', 'liberado'].includes(lote.estado) && <button className="boton-link-lotes" type="button" onClick={() => setLoteCalidad(lote)}>Registrar calidad</button>}{puedeAdministrar && <button className="boton-link-lotes" type="button" onClick={() => crearQr(lote)}>Generar QR</button>}</td></tr>)}</tbody></table></div>
        )}
      </section>

      {loteCalidad && <div className="capa-modal-lotes"><form className="modal-lotes" onSubmit={enviarCalidad}><span className="eyebrow-pagina-lotes">Inspección · {loteCalidad.codigo}</span><h2>Registrar calidad</h2><label>Resultado<select value={resultadoCalidad} onChange={(evento) => setResultadoCalidad(evento.target.value)}><option value="aprobado">Aprobado y liberar</option><option value="observado">Observado</option><option value="rechazado">Rechazado</option></select></label><label>Observaciones<textarea value={observacionesCalidad} onChange={(evento) => setObservacionesCalidad(evento.target.value)} rows="4" maxLength="1000" /></label><div className="acciones-modal-lotes"><button className="boton-secundario-lotes" type="button" onClick={() => setLoteCalidad(null)}>Cancelar</button><button className="boton-principal-lotes" type="submit" disabled={guardando}>Guardar inspección</button></div></form></div>}
    </div>
  )
}

export default Lotes
