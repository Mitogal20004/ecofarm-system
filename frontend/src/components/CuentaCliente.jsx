/* oxlint-disable react(set-state-in-effect) */
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, HandCoins, Printer, X } from 'lucide-react'
import { obtenerEstadoCuenta, registrarAbono } from '../services/clientes'
import logoEfarm from '../assets/logo-efarm-brand.png'

const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const mesActual = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
const formatearMes = (valor) => new Intl.DateTimeFormat('es-GT', {
  month: 'long',
  year: 'numeric',
}).format(new Date(`${valor.slice(0, 7)}-01T12:00:00`))

function CuentaCliente({ cliente, puedeAbonar, alCerrar }) {
  const [mes, setMes] = useState(mesActual)
  const [estado, setEstado] = useState(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [metodoAbierto, setMetodoAbierto] = useState(false)
  const [selectorMesAbierto, setSelectorMesAbierto] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const resultado = await obtenerEstadoCuenta(cliente.id, mes)
      // This effect synchronizes the dialog with the selected month.
      // oxlint-disable-next-line react(set-state-in-effect)
      setEstado(resultado)
      setError('')
    } catch { setError('No fue posible cargar el estado de cuenta.') }
  }, [cliente.id, mes])
  // The account is loaded from the API whenever the selected month changes.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { cargar() }, [cargar])

  const abonar = async (evento) => {
    evento.preventDefault()
    if (mensajeMonto || !monto || Number(monto) <= 0 || Number(monto) < 0) {
      setError(mensajeMonto || 'Ingresa un monto válido.')
      return
    }
    setGuardando(true)
    try { await registrarAbono(cliente.id, { monto, metodo_pago: metodo, observaciones }); setMonto(''); setObservaciones(''); await cargar() } catch { setError('No fue posible registrar el abono. Verifica el saldo pendiente.') } finally { setGuardando(false) }
  }

  const mensajeMonto = monto.startsWith('-')
    ? 'No se permiten montos negativos.'
    : monto && !/^\d+(?:\.\d{0,2})?$/.test(monto)
       ? 'Solo se permiten números y hasta dos decimales.'
       : ''
  const mesSeleccionado = mes.slice(0, 7)
  const [anioSeleccionado, numeroMesSeleccionado] = mesSeleccionado.split('-').map(Number)
  const seleccionarMes = (numeroMes) => {
    setMes(`${anioSeleccionado}-${String(numeroMes).padStart(2, '0')}-01`)
    setSelectorMesAbierto(false)
  }

  return <div className="cuenta-cliente" role="dialog" aria-modal="true" aria-labelledby="titulo-cuenta-cliente">
    <div className="cuenta-cliente-cabecera"><div><img className="cuenta-cliente-logo" src={logoEfarm} alt="E-farm" /><h2 id="titulo-cuenta-cliente">Cuenta de {cliente.nombre_completo ?? cliente.razon_social}</h2><p>Saldo actual: <strong>{moneda.format(Number(estado?.saldo ?? 0))}</strong></p></div><div className="cuenta-cliente-acciones no-imprimir-clientes"><button type="button" onClick={() => window.print()} aria-label="Imprimir cuenta" title="Imprimir cuenta"><Printer size={17} strokeWidth={2.1} aria-hidden="true" /></button><button type="button" onClick={alCerrar}><X size={17} strokeWidth={2.1} aria-hidden="true" />Cerrar</button></div></div>
    <div className="cuenta-cliente-resumen-impresion">
      <div><span>CLIENTE</span><strong>{cliente.nombre_completo ?? cliente.razon_social}</strong><small>NIT: {cliente.nit || 'No registrado'}</small></div>
      <div><span>PERÍODO</span><strong>{formatearMes(mes)}</strong><small>Saldo actual</small></div>
      <strong>{moneda.format(Number(estado?.saldo ?? 0))}</strong>
    </div>
     <div className="cuenta-cliente-mes"><span>Mes</span><span className="cuenta-cliente-mes-impresion">{formatearMes(mes)}</span><div className="selector-mes-cliente"><button className="boton-selector-mes-cliente" type="button" onClick={() => setSelectorMesAbierto((abierto) => !abierto)} aria-haspopup="dialog" aria-expanded={selectorMesAbierto}><span>{formatearMes(mes)}</span><CalendarDays size={18} strokeWidth={2} aria-hidden="true" /></button>{selectorMesAbierto && <div className="panel-selector-mes-cliente" role="dialog" aria-label="Seleccionar mes"><div className="cabecera-selector-mes-cliente"><strong>{anioSeleccionado}</strong><div><button type="button" onClick={() => setMes(`${anioSeleccionado - 1}-${String(numeroMesSeleccionado).padStart(2, '0')}-01`)} aria-label="Año anterior"><ChevronLeft size={17} aria-hidden="true" /></button><button type="button" onClick={() => setMes(`${anioSeleccionado + 1}-${String(numeroMesSeleccionado).padStart(2, '0')}-01`)} aria-label="Año siguiente"><ChevronRight size={17} aria-hidden="true" /></button></div></div><div className="rejilla-meses-cliente">{meses.map((nombreMes, indice) => <button key={nombreMes} className={indice + 1 === numeroMesSeleccionado ? 'mes-seleccionado' : ''} type="button" onClick={() => seleccionarMes(indice + 1)}>{nombreMes}</button>)}</div></div>}</div></div>
    {error && <p className="mensaje-error-clientes" role="alert">{error}</p>}
    <div className="cuenta-cliente-historial"><div className="movimiento-cuenta-cliente encabezado-movimientos-cuenta"><strong>FECHA</strong><strong>MOVIMIENTO</strong><strong>MONTO</strong></div>{estado?.movimientos?.length ? estado.movimientos.map((movimiento) => <div className="movimiento-cuenta-cliente" key={movimiento.id}><span>{new Date(movimiento.fecha).toLocaleDateString('es-GT')}</span><span>{movimiento.tipo === 'cargo' ? 'Cargo' : 'Abono'}</span><strong className={movimiento.tipo === 'abono' ? 'cuenta-abono' : ''}>{movimiento.tipo === 'abono' ? '-' : ''}{moneda.format(Number(movimiento.monto))}</strong></div>) : <p>No hay movimientos en este mes.</p>}</div>
    {puedeAbonar && <form className="formulario-abono-cliente" onSubmit={abonar}><h3>Registrar abono</h3><div className="campo-monto-abono"><input aria-label="Monto del abono" placeholder="Monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={Boolean(mensajeMonto)} aria-describedby="ayuda-monto-abono" /><small id="ayuda-monto-abono" className={mensajeMonto ? 'ayuda-monto-abono-error' : undefined}>{mensajeMonto || 'Ingresa un monto numérico.'}</small></div><div className="selector-metodo-abono"><button className="boton-selector-metodo-abono" type="button" onClick={() => setMetodoAbierto((abierto) => !abierto)} onBlur={() => window.setTimeout(() => setMetodoAbierto(false), 0)} aria-haspopup="listbox" aria-expanded={metodoAbierto}>{metodo === 'efectivo' ? 'Efectivo' : metodo === 'transferencia' ? 'Transferencia' : 'Tarjeta'}<ChevronDown size={16} strokeWidth={2.1} aria-hidden="true" /></button>{metodoAbierto && <div className="lista-metodos-abono" role="listbox">{[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta']].map(([valor, etiqueta]) => <button key={valor} type="button" role="option" aria-selected={metodo === valor} onMouseDown={(evento) => evento.preventDefault()} onClick={() => { setMetodo(valor); setMetodoAbierto(false) }}>{etiqueta}</button>)}</div>}</div><input aria-label="Observaciones" placeholder="Observaciones (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={500} /><button type="submit" disabled={guardando || Boolean(mensajeMonto)}><HandCoins size={16} strokeWidth={2.1} aria-hidden="true" />{guardando ? 'Guardando...' : 'Registrar abono'}</button></form>}
  </div>
}

export default CuentaCliente
