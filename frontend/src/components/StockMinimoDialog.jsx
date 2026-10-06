import { useEffect, useRef, useState } from 'react'
import { actualizarStockMinimo } from '../services/inventario'

function StockMinimoDialog({
  item,
  alCerrar,
  alGuardar,
  alRefrescarAutorizacion,
}) {
  const [stockMinimo, setStockMinimo] = useState(String(item.stock_minimo_manojos))
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campoRef = useRef(null)

  useEffect(() => {
    const temporizador = window.setTimeout(() => campoRef.current?.focus(), 0)
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

  const manejarEnvio = async (evento) => {
    evento.preventDefault()
    if (enviando) return
    const numero = Number(stockMinimo)

    if (
      !/^\d+$/.test(stockMinimo) ||
      !Number.isSafeInteger(numero) ||
      numero < 0 ||
      numero > 2147483647
    ) {
      setError('Ingresa un stock mínimo entero mayor o igual que cero.')
      return
    }

    setEnviando(true)
    setError('')

    try {
      const resultado = await actualizarStockMinimo(item.variante_id, numero)
      alGuardar(resultado)
    } catch (errorSolicitud) {
      if (errorSolicitud?.status === 403) {
        setError('No tienes permiso para cambiar el stock mínimo.')
      } else if (errorSolicitud?.status === 401) {
        setError('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else if (errorSolicitud?.status === 404) {
        setError('La variante solicitada ya no existe.')
      } else {
        setError('No fue posible actualizar el stock mínimo.')
      }
      if ([401, 403].includes(errorSolicitud?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fondo-dialogo-inventario">
      <section
        className="dialogo-inventario dialogo-stock-minimo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-stock-minimo"
      >
        <header className="encabezado-dialogo-inventario">
          <div>
            <p className="etiqueta-dialogo-inventario">Inventario</p>
            <h2 id="titulo-stock-minimo">Configurar stock mínimo</h2>
            <p>{item.codigo_sku} · {item.color}</p>
          </div>
          <button
            className="boton-cerrar-dialogo-inventario"
            type="button"
            onClick={alCerrar}
            disabled={enviando}
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </header>
        <form className="formulario-inventario" onSubmit={manejarEnvio} noValidate>
          <div className="campo-formulario-inventario campo-ancho-inventario">
            <label htmlFor="stock-minimo-inventario">Stock mínimo en manojos</label>
            <input
              ref={campoRef}
              id="stock-minimo-inventario"
              type="number"
              min="0"
              max="2147483647"
              step="1"
              value={stockMinimo}
              onChange={(evento) => {
                setStockMinimo(evento.target.value)
                setError('')
              }}
              disabled={enviando}
              aria-invalid={Boolean(error)}
            />
            <small>No modifica el stock actual.</small>
          </div>
          {error && (
            <p className="mensaje-error-inventario campo-ancho-inventario" role="alert">
              {error}
            </p>
          )}
          <div className="acciones-dialogo-inventario campo-ancho-inventario">
            <button
              className="boton-secundario-inventario"
              type="button"
              onClick={alCerrar}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              className="boton-primario-inventario"
              type="submit"
              disabled={enviando}
            >
              {enviando ? 'Guardando...' : 'Guardar stock mínimo'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default StockMinimoDialog
