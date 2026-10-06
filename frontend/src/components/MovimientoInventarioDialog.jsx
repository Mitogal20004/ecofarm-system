import { useEffect, useRef, useState } from 'react'
import {
  registrarAjuste,
  registrarEntrada,
  registrarSalida,
} from '../services/inventario'

const configuracion = {
  entrada: {
    titulo: 'Registrar entrada',
    etiqueta: 'Cantidad de manojos',
    campo: 'cantidad_manojos',
    boton: 'Registrar entrada',
  },
  salida: {
    titulo: 'Registrar salida manual',
    etiqueta: 'Cantidad de manojos',
    campo: 'cantidad_manojos',
    boton: 'Registrar salida',
  },
  ajuste: {
    titulo: 'Ajuste por conteo físico',
    etiqueta: 'Existencia física contada',
    campo: 'conteo_fisico_manojos',
    boton: 'Registrar ajuste',
  },
}

const obtenerMensajeError = (error, tipo) => {
  if (error?.status === 409) {
    return tipo === 'salida'
      ? 'No hay existencias suficientes o la variante está inactiva.'
      : 'No fue posible aplicar el movimiento a esta variante.'
  }
  if (error?.status === 403) return 'No tienes permiso para esta operación.'
  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }
  if (error?.status === 404) return 'La variante solicitada ya no existe.'
  return 'No fue posible registrar la operación de inventario.'
}

function MovimientoInventarioDialog({
  tipo,
  item,
  alCerrar,
  alGuardar,
  alRefrescarAutorizacion,
}) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState({})
  const [errorEnvio, setErrorEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campoInicialRef = useRef(null)
  const datosTipo = configuracion[tipo]

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

  const cantidadNumero = Number(cantidad)
  const cantidadValida =
    /^\d+$/.test(cantidad) &&
    Number.isSafeInteger(cantidadNumero) &&
    cantidadNumero >= (tipo === 'ajuste' ? 0 : 1) &&
    cantidadNumero <= 2147483647
  const saldoEstimado = cantidadValida
    ? tipo === 'entrada'
      ? item.stock_manojos + cantidadNumero
      : tipo === 'salida'
        ? item.stock_manojos - cantidadNumero
        : cantidadNumero
    : item.stock_manojos
  const diferencia = tipo === 'ajuste' && cantidadValida
    ? cantidadNumero - item.stock_manojos
    : null

  const manejarEnvio = async (evento) => {
    evento.preventDefault()
    if (enviando) return

    const nuevosErrores = {}
    const motivoNormalizado = motivo.trim().replace(/\s+/g, ' ')

    if (!cantidadValida) {
      nuevosErrores.cantidad = tipo === 'ajuste'
        ? 'Ingresa un conteo físico entero mayor o igual que cero.'
        : 'Ingresa una cantidad entera mayor que cero.'
    } else if (tipo === 'salida' && saldoEstimado < 0) {
      nuevosErrores.cantidad = 'La salida supera el stock disponible.'
    }
    if (!motivoNormalizado || motivoNormalizado.length > 500) {
      nuevosErrores.motivo = 'Ingresa un motivo de hasta 500 caracteres.'
    }

    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length > 0) return

    if (
      ['salida', 'ajuste'].includes(tipo) &&
      !window.confirm(
        tipo === 'salida'
          ? `Se descontarán ${cantidadNumero} manojos. ¿Deseas continuar?`
          : `El stock quedará en ${cantidadNumero} manojos. ¿Deseas continuar?`,
      )
    ) {
      return
    }

    setEnviando(true)
    setErrorEnvio('')

    try {
      const datos = {
        variante_id: item.variante_id,
        [datosTipo.campo]: cantidadNumero,
        motivo: motivoNormalizado,
      }
      const resultado = tipo === 'entrada'
        ? await registrarEntrada(datos)
        : tipo === 'salida'
          ? await registrarSalida(datos)
          : await registrarAjuste(datos)
      alGuardar(resultado, tipo)
    } catch (error) {
      setErrorEnvio(obtenerMensajeError(error, tipo))
      if ([401, 403].includes(error?.status)) alRefrescarAutorizacion()
    } finally {
      setEnviando(false)
    }
  }

  const cerrarDesdeFondo = (evento) => {
    if (evento.target === evento.currentTarget && !enviando) alCerrar()
  }

  return (
    <div className="fondo-dialogo-inventario" onMouseDown={cerrarDesdeFondo}>
      <section
        className="dialogo-inventario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-movimiento-inventario"
      >
        <header className="encabezado-dialogo-inventario">
          <div>
            <p className="etiqueta-dialogo-inventario">Inventario</p>
            <h2 id="titulo-movimiento-inventario">{datosTipo.titulo}</h2>
            <p>{item.codigo_sku} · {item.color} · {item.longitud_cm} cm</p>
          </div>
          <button
            className="boton-cerrar-dialogo-inventario"
            type="button"
            onClick={alCerrar}
            disabled={enviando}
            aria-label="Cerrar formulario"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <form className="formulario-inventario" onSubmit={manejarEnvio} noValidate>
          <div className="resumen-operacion-inventario campo-ancho-inventario">
            <span><small>Stock registrado</small><strong>{item.stock_manojos} manojos</strong></span>
            <span>
              <small>{tipo === 'ajuste' ? 'Diferencia' : 'Stock estimado'}</small>
              <strong>
                {tipo === 'ajuste' && diferencia !== null
                  ? `${diferencia > 0 ? '+' : ''}${diferencia} manojos`
                  : `${saldoEstimado} manojos`}
              </strong>
            </span>
          </div>

          <div className="campo-formulario-inventario campo-ancho-inventario">
            <label htmlFor="cantidad-movimiento-inventario">{datosTipo.etiqueta} *</label>
            <input
              ref={campoInicialRef}
              id="cantidad-movimiento-inventario"
              type="number"
              min={tipo === 'ajuste' ? '0' : '1'}
              max="2147483647"
              step="1"
              value={cantidad}
              onChange={(evento) => {
                setCantidad(evento.target.value)
                setErrores((actuales) => ({ ...actuales, cantidad: '' }))
                setErrorEnvio('')
              }}
              disabled={enviando}
              aria-invalid={Boolean(errores.cantidad)}
            />
            {errores.cantidad && (
              <p className="error-campo-inventario">{errores.cantidad}</p>
            )}
          </div>

          <div className="campo-formulario-inventario campo-ancho-inventario">
            <label htmlFor="motivo-movimiento-inventario">Motivo *</label>
            <textarea
              id="motivo-movimiento-inventario"
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                setErrores((actuales) => ({ ...actuales, motivo: '' }))
                setErrorEnvio('')
              }}
              maxLength={500}
              rows={3}
              disabled={enviando}
              aria-invalid={Boolean(errores.motivo)}
            />
            {errores.motivo && (
              <p className="error-campo-inventario">{errores.motivo}</p>
            )}
          </div>

          {errorEnvio && (
            <p className="mensaje-error-inventario campo-ancho-inventario" role="alert">
              {errorEnvio}
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
              {enviando ? 'Guardando...' : datosTipo.boton}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default MovimientoInventarioDialog
