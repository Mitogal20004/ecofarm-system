/* oxlint-disable react(set-state-in-effect) */
import { useCallback, useEffect, useState } from 'react'
import { obtenerEstadoCuenta, registrarAbono } from '../services/clientes'

const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
const mesActual = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

function CuentaCliente({ cliente, puedeAbonar, alCerrar }) {
  const [mes, setMes] = useState(mesActual)
  const [estado, setEstado] = useState(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
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
    if (!monto || Number(monto) <= 0) { setError('Ingresa un monto válido.'); return }
    setGuardando(true)
    try { await registrarAbono(cliente.id, { monto, metodo_pago: metodo, observaciones }); setMonto(''); setObservaciones(''); await cargar() } catch { setError('No fue posible registrar el abono. Verifica el saldo pendiente.') } finally { setGuardando(false) }
  }

  return <div className="cuenta-cliente" role="dialog" aria-modal="true" aria-labelledby="titulo-cuenta-cliente">
    <div className="cuenta-cliente-cabecera"><div><h2 id="titulo-cuenta-cliente">Cuenta de {cliente.nombre_completo ?? cliente.razon_social}</h2><p>Saldo actual: <strong>{moneda.format(Number(estado?.saldo ?? 0))}</strong></p></div><div className="cuenta-cliente-acciones no-imprimir-clientes"><button type="button" onClick={() => window.print()}>Imprimir</button><button type="button" onClick={alCerrar}>Cerrar</button></div></div>
    <label className="cuenta-cliente-mes">Mes <input type="month" value={mes.slice(0, 7)} onChange={(e) => setMes(`${e.target.value}-01`)} /></label>
    {error && <p className="mensaje-error-clientes" role="alert">{error}</p>}
    <div className="cuenta-cliente-historial">{estado?.movimientos?.length ? estado.movimientos.map((movimiento) => <div className="movimiento-cuenta-cliente" key={movimiento.id}><span>{new Date(movimiento.fecha).toLocaleDateString('es-GT')} · {movimiento.tipo === 'cargo' ? 'Cargo' : 'Abono'}</span><strong className={movimiento.tipo === 'abono' ? 'cuenta-abono' : ''}>{movimiento.tipo === 'abono' ? '-' : ''}{moneda.format(Number(movimiento.monto))}</strong></div>) : <p>No hay movimientos en este mes.</p>}</div>
    {puedeAbonar && <form className="formulario-abono-cliente" onSubmit={abonar}><h3>Registrar abono</h3><input aria-label="Monto del abono" placeholder="Monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /><select aria-label="Método de pago" value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select><input aria-label="Observaciones" placeholder="Observaciones (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={500} /><button type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar abono'}</button></form>}
  </div>
}

export default CuentaCliente
