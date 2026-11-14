import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarClientes } from '../services/clientes'
import { listarVariantes } from '../services/productos'
import { listarCotizaciones } from '../services/cotizaciones'
import {
  crearCompra,
  crearCompraDetalle,
  crearDespacho,
  crearInsumo,
  crearMerma,
  listarMermasOperativas,
  crearPedido,
  crearPedidoDetalle,
  listarComprasOperativas,
  listarDespachosOperativos,
  listarInsumosOperativos,
  listarPedidosOperativos,
  listarOrdenesEmpaque,
  crearOrdenEmpaque,
  listarProveedoresOperativos,
  listarLotesOperativos,
  actualizarOrdenEmpaque,
  actualizarDespacho,
  recibirCompra,
  reservarPedidoFifo,
  listarReservasOperativas,
  liberarReserva,
  consumirReserva,
} from '../services/operaciones'
import { Save } from 'lucide-react'
import './Operaciones.css'

const TABS = [
  ['compras', 'Compras', 'compra.ver', 'compra.administrar'],
  ['insumos', 'Insumos', 'insumo.ver', 'insumo.administrar'],
  ['pedidos', 'Pedidos', 'pedido.ver', 'pedido.administrar'],
  ['despachos', 'Despachos', 'despacho.ver', 'despacho.administrar'],
  ['mermas', 'Mermas', 'merma.ver', 'merma.registrar'],
  ['empaque', 'Empaque', 'pedido.ver', 'pedido.administrar'],
  ['reservas', 'Reservas FIFO', 'pedido.ver', null],
]

const INICIALES = {
  compras: { numero: '', proveedor_id: '', fecha_compra: new Date().toISOString().slice(0, 10), total: '0', observaciones: '', detalle_descripcion: '', detalle_variante_id: '', detalle_insumo_id: '', detalle_cantidad: '', detalle_costo_unitario: '' },
  insumos: { codigo: '', nombre: '', categoria: '', unidad_medida: 'unidad', costo_referencia: '0', stock_minimo: '0' },
  pedidos: { numero: '', cliente_id: '', cotizacion_id: '', fecha_entrega_estimada: '', direccion_entrega: '', observaciones: '', detalle_descripcion: '', detalle_variante_id: '', detalle_cantidad: '', detalle_precio_unitario: '' },
  despachos: { pedido_id: '', transportista: '', observaciones: '' },
  mermas: { lote_id: '', insumo_id: '', etapa: 'recepcion', motivo: '', cantidad: '', costo_unitario: '0', observaciones: '' },
  empaque: { numero: '', pedido_id: '', cantidad_paquetes: '0', observaciones: '' },
  reservas: {},
}

const CONFIG = {
  compras: { listar: listarComprasOperativas, crear: crearCompra, clave: 'compra', campos: [['numero', 'Número', 'text', true], ['proveedor_id', 'Proveedor', 'text', true], ['fecha_compra', 'Fecha', 'date', true], ['total', 'Total', 'number', true], ['detalle_descripcion', 'Detalle', 'text', false], ['detalle_variante_id', 'Variante', 'text', false], ['detalle_insumo_id', 'Insumo', 'text', false], ['detalle_cantidad', 'Cantidad detalle', 'number', false], ['detalle_costo_unitario', 'Costo detalle', 'number', false], ['observaciones', 'Observaciones', 'text', false]] },
  insumos: { listar: listarInsumosOperativos, crear: crearInsumo, clave: 'insumo', campos: [['codigo', 'Código', 'text', true], ['nombre', 'Nombre', 'text', true], ['categoria', 'Categoría', 'text', true], ['unidad_medida', 'Unidad', 'text', true], ['costo_referencia', 'Costo referencia', 'number', true], ['stock_minimo', 'Stock mínimo', 'number', true]] },
  pedidos: { listar: listarPedidosOperativos, crear: crearPedido, clave: 'pedido', campos: [['numero', 'Número', 'text', true], ['cliente_id', 'Cliente', 'text', true], ['cotizacion_id', 'Cotización ID', 'text', false], ['fecha_entrega_estimada', 'Entrega estimada', 'date', false], ['direccion_entrega', 'Dirección', 'text', false], ['detalle_descripcion', 'Detalle', 'text', false], ['detalle_variante_id', 'Variante', 'text', false], ['detalle_cantidad', 'Cantidad detalle', 'number', false], ['detalle_precio_unitario', 'Precio detalle', 'number', false], ['observaciones', 'Observaciones', 'text', false]] },
  despachos: { listar: listarDespachosOperativos, crear: crearDespacho, clave: 'despacho', campos: [['pedido_id', 'Pedido', 'text', true], ['transportista', 'Transportista', 'text', false], ['observaciones', 'Observaciones', 'text', false]] },
  mermas: { listar: listarMermasOperativas, crear: crearMerma, clave: 'merma', campos: [['lote_id', 'Lote', 'text', false], ['insumo_id', 'Insumo', 'text', false], ['etapa', 'Etapa', 'select', true], ['motivo', 'Motivo', 'text', true], ['cantidad', 'Cantidad', 'number', true], ['costo_unitario', 'Costo unitario', 'number', true], ['observaciones', 'Observaciones', 'text', false]] },
  empaque: { listar: listarOrdenesEmpaque, crear: crearOrdenEmpaque, clave: 'orden', campos: [['numero', 'Número', 'text', true], ['pedido_id', 'Pedido', 'text', false], ['cantidad_paquetes', 'Paquetes', 'number', true], ['observaciones', 'Observaciones', 'text', false]] },
  reservas: { listar: listarReservasOperativas, crear: null, clave: 'reserva', campos: [] },
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
  const [catalogos, setCatalogos] = useState({
    proveedores: [],
    variantes: [],
    insumos: [],
    clientes: [],
    lotes: [],
    pedidos: [],
    cotizaciones: [],
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
      if (['compras', 'pedidos'].includes(tab)) consultas.push(listarVariantes({ pagina: 1, limite: 100, activo: true }).then((items) => ['variantes', items.variantes]))
      if (['compras', 'mermas'].includes(tab)) consultas.push(listarInsumosOperativos().then((items) => ['insumos', items]))
      if (tab === 'pedidos') consultas.push(listarClientes({ pagina: 1, limite: 100, activo: true }).then((items) => ['clientes', items.clientes]))
      if (tab === 'pedidos') consultas.push(listarCotizaciones({ pagina: 1, limite: 100 }).then((items) => ['cotizaciones', items.cotizaciones]))
      if (['mermas'].includes(tab)) consultas.push(listarLotesOperativos().then((items) => ['lotes', items]))
      if (['despachos', 'empaque'].includes(tab)) consultas.push(listarPedidosOperativos().then((items) => ['pedidos', items]))
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

  const cambiarTab = (id) => {
    setMensaje('')
    setError('')
    setFormulario(INICIALES[id] ?? {})
    setTab(id)
  }
  const cambiarCampo = (evento) => setFormulario((actual) => ({ ...actual, [evento.target.name]: evento.target.value }))

  const opcionesCampo = (nombre) => {
    if (nombre === 'proveedor_id') return catalogos.proveedores.map((item) => ({ id: item.id, label: item.nombre }))
    if (nombre === 'cliente_id') return catalogos.clientes.map((item) => ({ id: item.id, label: item.nombre_completo ?? item.razon_social ?? item.id }))
    if (nombre === 'pedido_id') return catalogos.pedidos.map((item) => ({ id: item.id, label: `${item.numero} · ${item.estado}` }))
    if (nombre === 'cotizacion_id') return catalogos.cotizaciones.map((item) => ({ id: item.id, label: `${item.numero} · ${item.estado}` }))
    if (nombre === 'lote_id') return catalogos.lotes.map((item) => ({ id: item.id, label: `${item.codigo} · ${item.estado} · ${item.cantidad_disponible} disponibles` }))
    if (nombre.includes('variante_id')) return catalogos.variantes.map((item) => ({ id: item.id, label: `${item.codigo_sku} · ${item.color} · ${item.longitud_cm} cm` }))
    if (nombre.includes('insumo_id')) return catalogos.insumos.map((item) => ({ id: item.id, label: `${item.codigo} · ${item.nombre}` }))
    return []
  }

  const campoEsCatalogo = (nombre) => opcionesCampo(nombre).length > 0 || ['proveedor_id', 'cliente_id', 'pedido_id', 'cotizacion_id', 'lote_id', 'detalle_variante_id', 'detalle_insumo_id'].includes(nombre)

  const enviar = async (evento) => {
    evento.preventDefault()
    setGuardando(true); setError(''); setMensaje('')
    try {
      const datos = { ...formulario }
      for (const campo of ['total', 'costo_referencia', 'stock_minimo', 'cantidad', 'costo_unitario', 'detalle_cantidad', 'detalle_costo_unitario', 'detalle_precio_unitario']) if (datos[campo] !== undefined && datos[campo] !== '') datos[campo] = Number(datos[campo])
      for (const campo of ['cotizacion_id', 'fecha_entrega_estimada', 'observaciones', 'transportista', 'insumo_id', 'lote_id', 'pedido_id']) if (datos[campo] === '') datos[campo] = null
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
      if (tab === 'pedidos' && detalle_descripcion) {
        await crearPedidoDetalle(registro.id, { variante_id: detalle_variante_id, lote_id: null, descripcion: detalle_descripcion, cantidad: detalle_cantidad, precio_unitario: detalle_precio_unitario })
      }
      setFormulario(INICIALES[tab]); setMensaje('Registro guardado correctamente.'); await cargar()
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
      } else if (tab === 'pedidos') {
        const resultado = await reservarPedidoFifo(registro.id)
        setMensaje(`Pedido reservado. Reservas creadas: ${resultado.reservas_creadas ?? 0}.`)
      } else if (tab === 'empaque') {
        const estado = registro.estado === 'pendiente' ? 'en_proceso' : 'completada'
        await actualizarOrdenEmpaque(registro.id, estado)
        setMensaje(`Orden de empaque marcada como ${estado}.`)
      } else if (tab === 'despachos') {
        const siguiente = registro.estado === 'preparando' ? 'enviado' : registro.estado === 'enviado' ? 'entregado' : 'devuelto'
        await actualizarDespacho(registro.id, siguiente)
        setMensaje(`Despacho marcado como ${siguiente}.`)
      } else if (tab === 'reservas') {
        if (registro.estado === 'activa') {
          await liberarReserva(registro.id)
          setMensaje('Reserva liberada y saldo devuelto al lote.')
        }
      }
      await cargar()
    } catch (errorProceso) {
      setError(errorProceso?.message || 'No fue posible ejecutar el proceso.')
    }
  }

  if (!configuracion) return null
  return <div className="pagina-operaciones">
    <header className="encabezado-operaciones"><div><span className="eyebrow-operaciones">Operación interna</span><h1>Operaciones</h1><p>Compras, insumos, pedidos, despachos y control de mermas.</p></div><div className="resumen-operaciones"><strong>{registros.length}</strong><span>registros en {tab}</span></div></header>
    <div className="tabs-operaciones" role="tablist">{visibles.map(([id, nombre]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'tab-operacion-activa' : ''} onClick={() => cambiarTab(id)}>{nombre}</button>)}</div>
    {error && <div className="alerta-operaciones alerta-operaciones-error">{error}</div>}{mensaje && <div className="alerta-operaciones alerta-operaciones-exito">{mensaje}</div>}
      {puedeAdministrar && <section className="panel-operaciones"><div className="titulo-panel-operaciones"><div><span className="eyebrow-operaciones">Nuevo registro</span><h2>Agregar {TABS.find(([id]) => id === tab)?.[1].toLowerCase()}</h2></div></div><form className="formulario-operaciones" onSubmit={enviar}>{configuracion.campos.map(([nombre, etiqueta, tipo, requerido]) => <label key={nombre}><span>{etiqueta}{requerido && <span className="campo-obligatorio-operaciones" aria-hidden="true"> *</span>}</span>{campoEsCatalogo(nombre) ? <select name={nombre} value={formulario[nombre] ?? ''} onChange={cambiarCampo} required={requerido}><option value="">{requerido ? 'Selecciona una opción' : 'Sin asignar'}</option>{opcionesCampo(nombre).map((opcion) => <option value={opcion.id} key={opcion.id}>{opcion.label}</option>)}</select> : tipo === 'select' ? <select name={nombre} value={formulario[nombre] ?? ''} onChange={cambiarCampo} required={requerido}><option value="recepcion">Recepción</option><option value="clasificacion">Clasificación</option><option value="empaque">Empaque</option><option value="almacenamiento">Almacenamiento</option><option value="despacho">Despacho</option><option value="produccion">Producción</option></select> : <input name={nombre} type={tipo} value={formulario[nombre] ?? ''} onChange={cambiarCampo} required={requerido} />}</label>)}<div className="acciones-operaciones"><button className="boton-principal-operaciones" type="submit" disabled={guardando}><Save size={15} strokeWidth={2.5} aria-hidden="true" />{guardando ? 'Guardando...' : 'Guardar registro'}</button></div></form></section>}
     <section className="panel-operaciones"><div className="titulo-panel-operaciones"><div><span className="eyebrow-operaciones">Control</span><h2>Registros de {TABS.find(([id]) => id === tab)?.[1].toLowerCase()}</h2></div><button className="boton-secundario-operaciones" type="button" onClick={cargar}>Actualizar</button></div>{cargando ? <p className="estado-vacio-operaciones">Cargando...</p> : registros.length === 0 ? <p className="estado-vacio-operaciones">No hay registros todavía.</p> : <div className="tabla-operaciones-scroll"><table className="tabla-operaciones"><thead><tr>{Object.keys(registros[0]).slice(0, 7).map((campo) => <th key={campo}>{campo.replaceAll('_', ' ')}</th>)}{(puedeAdministrar && ['compras', 'pedidos', 'despachos', 'empaque'].includes(tab)) || tab === 'reservas' ? <th>Proceso</th> : null}</tr></thead><tbody>{registros.map((registro) => <tr key={registro.id}>{Object.keys(registros[0]).slice(0, 7).map((campo) => <td key={campo}>{String(registro[campo] ?? '—')}</td>)}{puedeAdministrar && tab === 'compras' && registro.estado !== 'recibida' && <td><button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}>Recibir compra</button></td>}{puedeAdministrar && tab === 'pedidos' && registro.estado === 'pendiente' && <td><button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}>Reservar FIFO</button></td>}{puedeAdministrar && tab === 'despachos' && ['preparando', 'enviado'].includes(registro.estado) && <td><button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}>{registro.estado === 'preparando' ? 'Enviar' : 'Entregar'}</button></td>}{puedeAdministrar && tab === 'empaque' && ['pendiente', 'en_proceso'].includes(registro.estado) && <td><button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}>{registro.estado === 'pendiente' ? 'Iniciar' : 'Completar'}</button></td>}{tab === 'reservas' && registro.estado === 'activa' && <td><button className="boton-link-operaciones" type="button" onClick={() => ejecutarProceso(registro)}>Liberar reserva</button><button className="boton-link-operaciones" type="button" onClick={() => consumirReserva(registro.id)}>Consumir</button></td>}</tr>)}</tbody></table></div>}</section>
  </div>
}

export default Operaciones
