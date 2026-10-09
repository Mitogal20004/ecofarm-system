import { useCallback, useEffect, useRef, useState } from 'react'
import { listarInventario } from '../services/inventario'
import MovimientoInventarioDialog from './MovimientoInventarioDialog'

function DescontarStockDialog({
  alCerrar,
  alGuardado,
  alRefrescarAutorizacion,
}) {
  const [inventario, setInventario] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const [itemSeleccionado, setItemSeleccionado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const campoInicialRef = useRef(null)

  const cargarInventario = useCallback(async (texto = '') => {
    setCargando(true)
    setError('')

    try {
      const resultado = await listarInventario({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda: texto,
      })
      setInventario(resultado.inventario)
      setVarianteId('')
    } catch (errorCarga) {
      setError(errorCarga?.message || 'No fue posible cargar el inventario.')
      if ([401, 403].includes(errorCarga?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      cargarInventario()
      campoInicialRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(temporizador)
  }, [cargarInventario])

  useEffect(() => {
    if (itemSeleccionado) return undefined
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', manejarTeclado)
    return () => {
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar, itemSeleccionado])

  if (itemSeleccionado) {
    return (
      <MovimientoInventarioDialog
        tipo="salida"
        item={itemSeleccionado}
        alCerrar={() => setItemSeleccionado(null)}
        alGuardar={(resultado) => {
          alGuardado(resultado)
          alCerrar()
        }}
        alRefrescarAutorizacion={alRefrescarAutorizacion}
      />
    )
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget) alCerrar()
  }

  return (
    <div className="fondo-dialogo-ventas" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-des-ventas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-des-ventas"
      >
        <header>
          <div>
            <p className="etiqueta-seccion-ventas">Movimiento manual</p>
            <h2 id="titulo-des-ventas">Descontar stock</h2>
            <p>Esta salida no crea una venta, un recibo ni un ingreso.</p>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar diálogo">×</button>
        </header>

        <div className="contenido-des-ventas">
          <div className="campo-ventas">
            <label htmlFor="buscar-variante-des">Buscar variante</label>
            <div className="control-con-boton-ventas">
              <input
                ref={campoInicialRef}
                id="buscar-variante-des"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') {
                    evento.preventDefault()
                    cargarInventario(busqueda.trim())
                  }
                }}
                maxLength={150}
                placeholder="SKU o color"
              />
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={() => cargarInventario(busqueda.trim())}
                disabled={cargando}
              >
                {cargando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
          <div className="campo-ventas">
            <label htmlFor="variante-des">Variante *</label>
            <select
              id="variante-des"
              value={varianteId}
              onChange={(evento) => setVarianteId(evento.target.value)}
              disabled={cargando}
            >
              <option value="">Selecciona una variante</option>
              {inventario.map((item) => (
                <option key={item.variante_id} value={item.variante_id}>
                  {item.codigo_sku} · {item.color} · {item.longitud_cm} cm · stock {item.stock_manojos}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mensaje-ventas mensaje-error-ventas" role="alert">{error}</p>}
        </div>

        <footer>
          <button className="boton-secundario-ventas" type="button" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            className="boton-primario-ventas"
            type="button"
            disabled={!varianteId}
            onClick={() => {
              const item = inventario.find(
                (actual) => actual.variante_id === varianteId,
              )
              if (item) setItemSeleccionado(item)
            }}
          >
            Continuar
          </button>
        </footer>
      </section>
    </div>
  )
}

export default DescontarStockDialog
