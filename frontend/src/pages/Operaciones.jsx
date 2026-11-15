import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarVariantes } from '../services/productos'
import {
  crearCompra,
  crearCompraDetalle,
  crearInsumo,
  crearMerma,
  listarMermasOperativas,
  listarComprasOperativas,
  listarInsumosOperativos,
  listarProveedoresOperativos,
  listarLotesOperativos,
  recibirCompra,
  editarInsumo,
  eliminarInsumo,
} from '../services/operaciones'
import { ChevronDown, ChevronLeft, ChevronRight, PackageCheck, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react'
import './Operaciones.css'

const TABS = [
  ['compras', 'Compras', 'compra.ver', 'compra.administrar'],
  ['insumos', 'Insumos', 'insumo.ver', 'insumo.administrar'],
  ['mermas', 'Mermas', 'merma.ver', 'merma.registrar'],
]

const INICIALES = {
  compras: { numero: '', proveedor_id: '', fecha_compra: new Date().toISOString().slice(0, 10), total: '0', observaciones: '', detalle_descripcion: '', detalle_variante_id: '', detalle_insumo_id: '', detalle_cantidad: '', detalle_costo_unitario: '' },
  insumos: { codigo: '', nombre: '', categoria: '', unidad_medida: 'unidad', costo_referencia: '0', stock_actual: '0', stock_minimo: '0' },
  mermas: { lote_id: '', insumo_id: '', etapa: 'recepcion', motivo: '', cantidad: '', costo_unitario: '0', observaciones: '' },
}

const CONFIG = {
  compras: { listar: listarComprasOperativas, crear: crearCompra, clave: 'compra', campos: [['numero', 'Número', 'text', true], ['proveedor_id', 'Proveedor', 'text', true], ['fecha_compra', 'Fecha', 'date', true], ['total', 'Total', 'number', true], ['detalle_descripcion', 'Detalle', 'text', false], ['detalle_variante_id', 'Variante', 'text', false], ['detalle_insumo_id', 'Insumo', 'text', false], ['detalle_cantidad', 'Cantidad detalle', 'number', false], ['detalle_costo_unitario', 'Costo detalle', 'number', false], ['observaciones', 'Observaciones', 'text', false]] },
  insumos: { listar: listarInsumosOperativos, crear: crearInsumo, clave: 'insumo', campos: [['codigo', 'Código', 'text', true], ['nombre', 'Nombre', 'text', true], ['categoria', 'Categoría', 'text', true], ['unidad_medida', 'Unidad', 'text', true], ['costo_referencia', 'Costo referencia', 'number', true], ['stock_actual', 'Stock actual', 'number', true], ['stock_minimo', 'Stock mínimo', 'number', true]] },
  mermas: { listar: listarMermasOperativas, crear: crearMerma, clave: 'merma', campos: [['lote_id', 'Lote', 'text', false], ['insumo_id', 'Insumo', 'text', false], ['etapa', 'Etapa', 'select', true], ['motivo', 'Motivo', 'text', true], ['cantidad', 'Cantidad', 'number', true], ['costo_unitario', 'Costo unitario', 'number', true], ['observaciones', 'Observaciones', 'text', false]] },
}

const PLACEHOLDERS = {
  numero: 'Ej. OP-2026-001', codigo: 'Ej. INS-001', nombre: 'Nombre del insumo', categoria: 'Ej. Empaque', unidad_medida: 'Ej. unidad',
  total: '0.00', costo_referencia: '0.00', stock_minimo: '0', detalle_descripcion: 'Describe el detalle', detalle_cantidad: '0',
  detalle_costo_unitario: '0.00', detalle_precio_unitario: '0.00', direccion_entrega: 'Dirección de entrega', observaciones: 'Notas adicionales',
   motivo: 'Motivo de la merma', cantidad: '0', costo_unitario: '0.00',
}

function ListaPersonalizada({ nombre, value, onChange, opciones, requerido, placeholder }) {
  const [abierta, setAbierta] = useState(false)
  const seleccion = opciones.find((opcion) => String(opcion.id) === String(value))
  return <div className={`lista-personalizada-operaciones ${abierta ? 'lista-abierta-operaciones' : ''}`}>
    <button type="button" className="lista-boton-operaciones" aria-haspopup="listbox" aria-expanded={abierta} onClick={() => setAbierta((actual) => !actual)}><span>{seleccion?.label ?? placeholder}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {abierta && <ul className="lista-opciones-operaciones" role="listbox">
      {!requerido && <li><button type="button" onClick={() => { onChange(''); setAbierta(false) }}>{placeholder}</button></li>}
      {opciones.map((opcion) => <li key={opcion.id}><button type="button" role="option" aria-selected={String(opcion.id) === String(value)} onClick={() => { onChange(opcion.id); setAbierta(false) }}>{opcion.label}</button></li>)}
    </ul>}
    <input type="text" name={nombre} value={value ?? ''} onChange={() => {}} required={requerido} tabIndex={-1} aria-hidden="true" className="lista-valor-oculto-operaciones" />
    </div>
}

function Operaciones({ permisos, alRefrescarAutorizacion }) {
  const visibles = useMemo(() => TABS.filter(([, , ver, administrar]) => permisos.includes(ver) || permisos.includes(administrar)), [permisos])
  const [tab, setTab] = useState(visibles[0]?.[0] ?? 'compras')
  const [registros, setRegistros] = useState([])
  const [formulario, setFormulario] = useState(INICIALES[tab] ?? {})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [insumoEditando, setInsumoEditando] = useState(null)
  const [formularioInsumo, setFormularioInsumo] = useState({})
  const [errorInsumo, setErrorInsumo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [catalogos, setCatalogos] = useState({
    proveedores: [],
    variantes: [],
    insumos: [],
    lotes: [],
  })

  const configuracion = CONFIG[tab]
  const permisoAdministrar = TABS.find(([id]) => id === tab)?.[3]
  const puedeAdministrar = Boolean(permisoAdministrar) && permisos.includes(permisoAdministrar)

  const cargar = useCallback(async () => {
    if (!configuracion) return
    setCargando(true)
    setError('')
    try {
      setRegistros(await configuracion.listar())
      const consultas = []
      if (['compras'].includes(tab)) consultas.push(listarProveedoresOperativos().then((items) => ['proveedores', items]))
       if (tab === 'compras') consultas.push(listarVariantes({ pagina: 1, limite: 100, activo: true }).then((items) => ['variantes', items.variantes]))
      if (['compras', 'mermas'].includes(tab)) consultas.push(listarInsumosOperativos().then((items) => ['insumos', items]))
       if (['mermas'].includes(tab)) consultas.push(listarLotesOperativos().then((items) => ['lotes', items]))
      const resultadosCatalogos = await Promise.all(consultas)
       setCatalogos((actuales) => resultadosCatalogos.reduce((acumulado, [clave, items]) => { acumulado[clave] = items; return acumulado }, { ...actuales }))
    } catch (errorCarga) {
      setError(errorCarga?.status === 403 ? 'No tienes permiso para consultar este módulo.' : 'No fue posible cargar los registros.')
      if ([401, 403].includes(errorCarga?.status)) alRefrescarAutorizacion?.()
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion, configuracion, tab])

  useEffect(() => {
    const temporizador = window.setTimeout(() => cargar(), 0)
    return () => window.clearTimeout(temporizador)
  }, [cargar, tab])

  useEffect(() => {
    const temporizador = window.setTimeout(() => { setBusquedaAplicada(busqueda); setPagina(1) }, 1000)
    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const cambiarTab = (id) => {
    setMensaje('')
    setError('')
    setFormulario(INICIALES[id] ?? {})
    setBusqueda(''); setBusquedaAplicada(''); setPagina(1)
    setInsumoEditando(null); setErrorInsumo('')
    setTab(id)
  }
  const cambiarCampo = (evento) => setFormulario((actual) => ({ ...actual, [evento.target.name]: evento.target.value }))

  const opcionesCampo = (nombre) => {
    if (nombre === 'proveedor_id') return catalogos.proveedores.map((item) => ({ id: item.id, label: item.nombre }))
    if (nombre === 'cliente_id') return catalogos.clientes.map((item) => ({ id: item.id, label: item.nombre_completo ?? item.razon_social ?? item.id }))
    if (nombre === 'lote_id') return catalogos.lotes.map((item) => ({ id: item.id, label: `${item.codigo} · ${item.estado} · ${item.cantidad_disponible} disponibles` }))
    if (nombre.includes('variante_id')) return catalogos.variantes.map((item) => ({ id: item.id, label: `${item.codigo_sku} · ${item.color} · ${item.longitud_cm} cm` }))
    if (nombre.includes('insumo_id')) return catalogos.insumos.map((item) => ({ id: item.id, label: `${item.codigo} · ${item.nombre}` }))
    return []
  }

  const campoEsCatalogo = (nombre) => opcionesCampo(nombre).length > 0 || ['proveedor_id', 'lote_id', 'detalle_variante_id', 'detalle_insumo_id'].includes(nombre)

  const nombresCampos = {
    id: 'ID', proveedor_id: 'Proveedor',
    lote_id: 'Lote', fecha_compra: 'Fecha de compra', fecha_entrega_estimada: 'Entrega estimada',
    unidad_medida: 'Unidad', costo_referencia: 'Costo referencia', stock_actual: 'Stock actual', stock_minimo: 'Stock mínimo', activo: 'Estado',
  }
  const obtenerValorVisible = (registro, campo) => {
    const valor = registro[campo]
    if (valor === null || valor === undefined || valor === '') return '—'
    if (campo === 'activo') return valor ? 'Activo' : 'Inactivo'
    if (campo.endsWith('_id')) {
      const opcion = opcionesCampo(campo).find((item) => String(item.id) === String(valor))
      if (opcion) return opcion.label
    }
    return String(valor)
  }

  const registrosFiltrados = registros.filter((registro) => !busquedaAplicada.trim() || Object.values(registro).some((valor) => String(valor ?? '').toLowerCase().includes(busquedaAplicada.trim().toLowerCase())))
  const tamanoPagina = 8
  const totalPaginas = Math.max(1, Math.ceil(registrosFiltrados.length / tamanoPagina))
  const registrosPagina = registrosFiltrados.slice((pagina - 1) * tamanoPagina, pagina * tamanoPagina)

  const enviar = async (evento) => {
    evento.preventDefault()
    setGuardando(true); setError(''); setMensaje('')
    try {
      const datos = { ...formulario }
       for (const campo of ['total', 'costo_referencia', 'stock_actual', 'stock_minimo', 'cantidad', 'costo_unitario', 'detalle_cantidad', 'detalle_costo_unitario', 'detalle_precio_unitario']) if (datos[campo] !== undefined && datos[campo] !== '') datos[campo] = Number(datos[campo])
       for (const campo of ['insumo_id', 'lote_id', 'observaciones']) if (datos[campo] === '') datos[campo] = null
      if (tab === 'mermas' && datos.lote_id && datos.insumo_id) throw new Error('Una merma debe referirse a un lote o a un insumo, no a ambos.')
      const {
        detalle_descripcion,
        detalle_variante_id,
        detalle_insumo_id,
        detalle_cantidad,
        detalle_costo_unitario,
        detalle_precio_unitario,
        ...datosCabecera
      } = datos
      if (!configuracion.crear) return
      const registro = await configuracion.crear(datosCabecera)
      if (tab === 'compras' && detalle_descripcion) {
        if (Boolean(detalle_variante_id) === Boolean(detalle_insumo_id)) throw new Error('El detalle debe indicar una variante o un insumo.')
        await crearCompraDetalle(registro.id, { insumo_id: detalle_insumo_id, variante_id: detalle_variante_id, descripcion: detalle_descripcion, cantidad: detalle_cantidad, costo_unitario: detalle_costo_unitario })
      }
       setFormulario(INICIALES[tab]); setPagina(1); setMensaje('Registro guardado correctamente.'); await cargar()
    } catch (errorGuardado) {
      setError(errorGuardado?.message || 'No fue posible guardar el registro.')
    } finally { setGuardando(false) }
  }

  const ejecutarProceso = async (registro) => {
    setError(''); setMensaje('')
    try {
      if (tab === 'compras') {
        const resultado = await recibirCompra(registro.id)
        setMensaje(`Compra recibida. Lotes creados: ${resultado.lotes_creados ?? 0}.`)
      }
      await cargar()
    } catch (errorProceso) {
      setError(errorProceso?.message || 'No fue posible ejecutar el proceso.')
    }
  }

  const abrirEdicionInsumo = (insumo) => {
    setErrorInsumo('')
    setInsumoEditando(insumo)
     setFormularioInsumo({ codigo: insumo.codigo ?? '', nombre: insumo.nombre ?? '', categoria: insumo.categoria ?? '', unidad_medida: insumo.unidad_medida ?? '', costo_referencia: insumo.costo_referencia ?? 0, stock_actual: insumo.stock_actual ?? 0, stock_minimo: insumo.stock_minimo ?? 0 })
  }

  const guardarEdicionInsumo = async (evento) => {
    evento.preventDefault()
    setGuardando(true); setErrorInsumo(''); setError(''); setMensaje('')
    try {
       await editarInsumo(insumoEditando.id, { ...formularioInsumo, costo_referencia: Number(formularioInsumo.costo_referencia), stock_actual: Number(formularioInsumo.stock_actual), stock_minimo: Number(formularioInsumo.stock_minimo) })
      setInsumoEditando(null); setFormularioInsumo({}); setMensaje('Insumo actualizado correctamente.'); await cargar()
    } catch (errorGuardado) {
      setErrorInsumo(errorGuardado?.message || 'No fue posible actualizar el insumo.')
    } finally { setGuardando(false) }
  }

  const confirmarEliminarInsumo = async (insumo) => {
    if (!window.confirm(`¿Eliminar el insumo ${insumo.codigo ?? insumo.nombre}?`)) return
    setError(''); setMensaje('')
    try {
      await eliminarInsumo(insumo.id)
      setMensaje('Insumo eliminado correctamente.'); await cargar()
    } catch (errorEliminacion) {
      setError(errorEliminacion?.message || 'No fue posible eliminar el insumo.')
    }
  }

  const campos = registros[0]
    ? tab === 'insumos'
      ? ['codigo', 'nombre', 'categoria', 'unidad_medida', 'costo_referencia', 'stock_actual', 'stock_minimo', 'activo']
      : Object.keys(registros[0]).filter((campo) => campo !== 'id').slice(0, 7)
    : []
  const tieneAccionesInsumos = tab === 'insumos' && puedeAdministrar
  const renderProceso = (registro) => {
    if (puedeAdministrar && tab === 'compras' && registro.estado !== 'recibida') return <button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}><PackageCheck size={14} aria-hidden="true" />Recibir compra</button>
    return null
  }
  if (!configuracion) return null
   return <div className="pagina-operaciones">
     <header className="encabezado-operaciones"><div><span className="eyebrow-operaciones">Operación interna</span><h1>Operaciones</h1><p>Compras, insumos, lotes y control de mermas.</p></div><div className="resumen-operaciones"><strong>{registrosFiltrados.length}</strong><span>registros en {tab}</span></div></header>
    <div className="tabs-operaciones" role="tablist">{visibles.map(([id, nombre]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'tab-operacion-activa' : ''} onClick={() => cambiarTab(id)}>{nombre}</button>)}</div>
    {error && <div className="alerta-operaciones alerta-operaciones-error">{error}</div>}{mensaje && <div className="alerta-operaciones alerta-operaciones-exito">{mensaje}</div>}
    {puedeAdministrar && <section className="panel-operaciones"><div className="titulo-panel-operaciones"><div><span className="eyebrow-operaciones">Nuevo registro</span><h2>Agregar {TABS.find(([id]) => id === tab)?.[1].toLowerCase()}</h2></div></div><form className="formulario-operaciones" onSubmit={enviar}>{configuracion.campos.map(([nombre, etiqueta, tipo, requerido]) => <label key={nombre}><span>{etiqueta}{requerido && <span className="campo-obligatorio-operaciones" aria-hidden="true"> *</span>}</span>{campoEsCatalogo(nombre) ? <ListaPersonalizada nombre={nombre} value={formulario[nombre]} onChange={(valor) => setFormulario((actual) => ({ ...actual, [nombre]: valor }))} opciones={opcionesCampo(nombre)} requerido={requerido} placeholder={requerido ? 'Selecciona una opción' : 'Sin asignar'} /> : tipo === 'select' ? <ListaPersonalizada nombre={nombre} value={formulario[nombre]} onChange={(valor) => setFormulario((actual) => ({ ...actual, [nombre]: valor }))} opciones={['recepcion', 'clasificacion', 'empaque', 'almacenamiento', 'despacho', 'produccion'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }))} requerido={requerido} placeholder="Selecciona una etapa" /> : <input name={nombre} type={tipo} placeholder={PLACEHOLDERS[nombre]} value={formulario[nombre] ?? ''} onChange={cambiarCampo} required={requerido} />}</label>)}<div className="acciones-operaciones"><button className="boton-principal-operaciones" type="submit" disabled={guardando}><Save size={15} strokeWidth={2.5} aria-hidden="true" />{guardando ? 'Guardando...' : 'Guardar registro'}</button></div></form></section>}
     <section className="panel-operaciones"><div className="titulo-panel-operaciones"><div><span className="eyebrow-operaciones">Control</span><h2>Registros de {TABS.find(([id]) => id === tab)?.[1].toLowerCase()}</h2></div><button className="boton-secundario-operaciones" type="button" onClick={cargar}><RefreshCw size={14} aria-hidden="true" />Actualizar</button></div><div className="controles-tabla-operaciones"><label htmlFor="buscar-operaciones">Buscar registros</label><input id="buscar-operaciones" type="search" placeholder="Buscar por cualquier campo..." value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} /></div>{cargando ? <p className="estado-vacio-operaciones">Cargando...</p> : registrosFiltrados.length === 0 ? <p className="estado-vacio-operaciones">{registros.length ? 'No hay coincidencias.' : 'No hay registros todavía.'}</p> : <><div className="tabla-operaciones-scroll"><table className="tabla-operaciones"><thead><tr>{campos.map((campo) => <th key={campo}>{nombresCampos[campo] ?? campo.replaceAll('_', ' ')}</th>)}{tieneAccionesInsumos && <th>Acciones</th>}{((puedeAdministrar && ['compras', 'pedidos', 'despachos', 'empaque'].includes(tab)) || tab === 'reservas') && <th>Proceso</th>}</tr></thead><tbody>{registrosPagina.map((registro) => <tr key={registro.id}>{campos.map((campo) => <td key={campo}>{obtenerValorVisible(registro, campo)}</td>)}{tieneAccionesInsumos && <td><div className="acciones-tabla-operaciones"><button className="boton-icono-operaciones" type="button" title="Editar insumo" aria-label="Editar insumo" onClick={() => abrirEdicionInsumo(registro)}><Pencil size={15} /></button><button className="boton-icono-operaciones boton-icono-peligro-operaciones" type="button" title="Eliminar insumo" aria-label="Eliminar insumo" onClick={() => confirmarEliminarInsumo(registro)}><Trash2 size={15} /></button></div></td>}{((puedeAdministrar && ['compras', 'pedidos', 'despachos', 'empaque'].includes(tab)) || tab === 'reservas') && <td>{renderProceso(registro)}</td>}</tr>)}</tbody></table></div><div className="paginacion-operaciones"><span>Página {pagina} de {totalPaginas}</span><button type="button" aria-label="Página anterior" disabled={pagina === 1} onClick={() => setPagina((actual) => actual - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label="Página siguiente" disabled={pagina === totalPaginas} onClick={() => setPagina((actual) => actual + 1)}><ChevronRight size={16} /></button></div></>}</section>
      {insumoEditando && <div className="modal-operaciones-fondo" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setInsumoEditando(null) }}><section className="modal-operaciones" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-insumo"><div className="titulo-modal-operaciones"><div><span className="eyebrow-operaciones">Insumos</span><h2 id="titulo-editar-insumo">Editar insumo</h2></div><button className="boton-icono-operaciones" type="button" aria-label="Cerrar" onClick={() => setInsumoEditando(null)}><X size={18} /></button></div><form className="formulario-modal-operaciones" onSubmit={guardarEdicionInsumo}>{[['codigo', 'Código', 'text'], ['nombre', 'Nombre', 'text'], ['categoria', 'Categoría', 'text'], ['unidad_medida', 'Unidad', 'text'], ['costo_referencia', 'Costo referencia', 'number'], ['stock_actual', 'Stock actual', 'number'], ['stock_minimo', 'Stock mínimo', 'number']].map(([nombre, etiqueta, tipo]) => <label key={nombre}><span>{etiqueta}</span><input name={nombre} type={tipo} min={tipo === 'number' ? '0' : undefined} step={tipo === 'number' ? 'any' : undefined} value={formularioInsumo[nombre] ?? ''} onChange={(evento) => setFormularioInsumo((actual) => ({ ...actual, [nombre]: evento.target.value }))} required /></label>)}{errorInsumo && <div className="alerta-operaciones alerta-operaciones-error">{errorInsumo}</div>}<div className="acciones-modal-operaciones"><button className="boton-secundario-operaciones" type="button" onClick={() => setInsumoEditando(null)}>Cancelar</button><button className="boton-principal-operaciones" type="submit" disabled={guardando}><Save size={15} />{guardando ? 'Guardando...' : 'Guardar cambios'}</button></div></form></section></div>}
   </div>
 }

 export default Operaciones
