import { useEffect, useMemo, useRef, useState } from 'react'
import { listarClientes } from '../services/clientes'
import { listarInventario } from '../services/inventario'
import { listarVariantes } from '../services/productos'
import {
  confirmarVenta,
  crearIntencionVenta,
} from '../services/ventas'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'

const FORMULARIO_INICIAL = {
  cliente_id: '',
  comprador_nombre: '',
  comprador_nit: '',
  comprador_direccion: '',
  observaciones: '',
}

const formatoMoneda = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const nombreCliente = (cliente) =>
  cliente?.nombre_completo ?? cliente?.razon_social ?? 'Cliente sin nombre'

const claveLinea = (varianteId, presentacionId) =>
  `${varianteId}:${presentacionId}`

function VentaPos({ puedeVer, alVerVenta, alRefrescarAutorizacion }) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [clientes, setClientes] = useState([])
  const [variantes, setVariantes] = useState([])
  const [existencias, setExistencias] = useState(new Map())
  const [presentacionesActivas, setPresentacionesActivas] = useState(new Set())
  const [lineas, setLineas] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const [presentacionId, setPresentacionId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [claveIdempotencia, setClaveIdempotencia] = useState('')
  const [cargando, setCargando] = useState(true)
  const [consultandoClientes, setConsultandoClientes] = useState(false)
  const [consultandoProductos, setConsultandoProductos] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [reintentoPendiente, setReintentoPendiente] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState(null)
  const confirmandoRef = useRef(false)
  const buscadorProductoRef = useRef(null)

  const cargarCatalogos = async (busqueda = '') => {
    const [resultadoVariantes, resultadoInventario] = await Promise.all([
      listarVariantes({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda,
      }),
      listarInventario({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda,
      }),
    ])

    setVariantes(resultadoVariantes.variantes)
    setExistencias((actuales) => {
      const siguientes = new Map(actuales)
      resultadoInventario.inventario.forEach((item) => {
        siguientes.set(item.variante_id, item)
      })
      return siguientes
    })
    setPresentacionesActivas((actuales) => {
      const siguientes = new Set(actuales)
      resultadoInventario.presentaciones
        .filter((presentacion) => presentacion.activo)
        .forEach((presentacion) => siguientes.add(presentacion.id))
      return siguientes
    })
  }

  useEffect(() => {
    let activo = true

    const cargar = async () => {
      setCargando(true)
      setError('')

      try {
        const [resultadoClientes, clave] = await Promise.all([
          listarClientes({ pagina: 1, limite: 100, activo: true }),
          crearIntencionVenta(),
          cargarCatalogos(),
        ])

        if (!activo) return
        setClientes(resultadoClientes.clientes)
        setClaveIdempotencia(clave)
      } catch (errorCarga) {
        if (!activo) return
        setError(
          errorCarga?.message || 'No fue posible preparar la nueva venta.',
        )
        if ([401, 403].includes(errorCarga?.status)) {
          alRefrescarAutorizacion?.()
        }
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()
    return () => {
      activo = false
    }
  }, [alRefrescarAutorizacion])

  const varianteSeleccionada = useMemo(
    () => variantes.find((variante) => variante.id === varianteId) ?? null,
    [varianteId, variantes],
  )
  const preciosDisponibles = (varianteSeleccionada?.precios ?? []).filter(
    (precio) => presentacionesActivas.has(precio.presentacion_id),
  )
  const precioSeleccionado =
    preciosDisponibles.find(
      (precio) => precio.presentacion_id === presentacionId,
    ) ?? null
  const existenciaSeleccionada = varianteSeleccionada
    ? existencias.get(varianteSeleccionada.id)
    : null
  const clienteSeleccionado =
    clientes.find((cliente) => cliente.id === formulario.cliente_id) ?? null
  const cantidadNumero = /^\d+$/.test(cantidad) ? Number(cantidad) : 0
  const cantidadValida =
    Number.isSafeInteger(cantidadNumero) &&
    cantidadNumero > 0 &&
    cantidadNumero <= 1000000
  const manojosSeleccionados = precioSeleccionado && cantidadValida
    ? Number(precioSeleccionado.cantidad_manojos) * cantidadNumero
    : 0

  const consumoPorVariante = useMemo(() => {
    const consumo = new Map()
    lineas.forEach((linea) => {
      consumo.set(
        linea.variante_id,
        (consumo.get(linea.variante_id) ?? 0) +
          linea.cantidad_presentaciones * linea.cantidad_manojos_presentacion,
      )
    })
    return consumo
  }, [lineas])

  const consumoPrevistoVariante = varianteSeleccionada
    ? (consumoPorVariante.get(varianteSeleccionada.id) ?? 0) +
      manojosSeleccionados
    : 0
  const stockSeleccionado = Number(existenciaSeleccionada?.stock_manojos ?? 0)
  const stockMinimoSeleccionado = Number(
    existenciaSeleccionada?.stock_minimo_manojos ?? 0,
  )
  const consumoCarritoVariante = varianteSeleccionada
    ? consumoPorVariante.get(varianteSeleccionada.id) ?? 0
    : 0
  const stockRestantePrevisto = varianteSeleccionada
    ? stockSeleccionado - consumoPrevistoVariante
    : 0
  const seleccionSinStock =
    Boolean(varianteSeleccionada && precioSeleccionado && cantidadValida) &&
    consumoPrevistoVariante > stockSeleccionado
  const lineasSinStock = lineas.some((linea) => {
    const disponible = Number(
      existencias.get(linea.variante_id)?.stock_manojos ?? 0,
    )
    return (consumoPorVariante.get(linea.variante_id) ?? 0) > disponible
  })
  const lineasInvalidas = lineas.some(
    (linea) =>
      !Number.isSafeInteger(linea.cantidad_presentaciones) ||
      linea.cantidad_presentaciones < 1 ||
      linea.cantidad_presentaciones > 1000000,
  )
  const totalPrevisto = lineas.reduce(
    (total, linea) =>
      total + linea.precio_unitario * linea.cantidad_presentaciones,
    0,
  )
  const patronMonto = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/
  const montoRecibidoNumero = patronMonto.test(montoRecibido)
    ? Number(montoRecibido)
    : 0
  const montoRecibidoValido =
    Number.isFinite(montoRecibidoNumero) &&
    montoRecibidoNumero > 0 &&
    montoRecibidoNumero <= 999999999999.99
  const diferenciaPago = montoRecibidoValido
    ? Math.round((montoRecibidoNumero - totalPrevisto) * 100) / 100
    : null
  const pagoSuficiente = diferenciaPago !== null && diferenciaPago >= 0
  const cambioPrevisto = pagoSuficiente ? diferenciaPago : 0
  const montoFaltante = diferenciaPago !== null && diferenciaPago < 0
    ? Math.abs(diferenciaPago)
    : 0

  const hayDatosCapturados =
    lineas.length > 0 ||
    Boolean(formulario.cliente_id) ||
    Boolean(formulario.comprador_nombre.trim()) ||
    Boolean(formulario.comprador_nit.trim()) ||
    Boolean(formulario.comprador_direccion.trim()) ||
    Boolean(formulario.observaciones.trim()) ||
    Boolean(montoRecibido) ||
    Boolean(varianteId) ||
    Boolean(presentacionId)

  const actualizarFormulario = (evento) => {
    const { name, value } = evento.target
    setFormulario((actual) => ({ ...actual, [name]: value }))
    setError('')
  }

  const buscarClientes = async () => {
    if (consultandoClientes || reintentoPendiente) return
    setConsultandoClientes(true)
    setError('')

    try {
      const respuesta = await listarClientes({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda: busquedaCliente.trim(),
      })
      setClientes(respuesta.clientes)
    } catch (errorConsulta) {
      setError(errorConsulta?.message || 'No fue posible buscar clientes.')
    } finally {
      setConsultandoClientes(false)
    }
  }

  const seleccionarCliente = (clienteId) => {
    const cliente = clientes.find((actual) => actual.id === clienteId)

    if (!cliente) {
      setFormulario((actual) => ({ ...actual, cliente_id: '' }))
      return
    }

    setFormulario((actual) => ({
      ...actual,
      cliente_id: cliente.id,
      comprador_nombre: nombreCliente(cliente),
      comprador_nit: cliente.nit ?? '',
      comprador_direccion: cliente.direccion ?? '',
    }))
    setError('')
  }

  const quitarClienteSeleccionado = () => {
    setFormulario((actual) => ({ ...actual, cliente_id: '' }))
    setBusquedaCliente('')
    setError('')
  }

  const buscarProductos = async () => {
    if (consultandoProductos || reintentoPendiente) return
    setConsultandoProductos(true)
    setError('')

    try {
      await cargarCatalogos(busquedaProducto.trim())
      setVarianteId('')
      setPresentacionId('')
    } catch (errorConsulta) {
      setError(errorConsulta?.message || 'No fue posible buscar productos.')
    } finally {
      setConsultandoProductos(false)
    }
  }

  const escribirCantidad = (valor) => {
    if (reintentoPendiente) return
    if (valor === 'C') {
      setCantidad('')
    } else if (valor === '←') {
      setCantidad((actual) => actual.slice(0, -1))
    } else {
      setCantidad((actual) => {
        const siguiente = `${actual}${valor}`.replace(/^0+(?=\d)/, '')
        return siguiente.length <= 7 ? siguiente : actual
      })
    }
    setError('')
  }

  const actualizarMontoRecibido = (valor) => {
    const monto = valor.replace(',', '.')

    if (monto === '' || /^\d{0,12}(?:\.\d{0,2})?$/.test(monto)) {
      setMontoRecibido(monto)
      setError('')
    }
  }

  const manejarTecladoCalculadora = (evento) => {
    if (/^\d$/.test(evento.key)) {
      evento.preventDefault()
      escribirCantidad(evento.key)
    } else if (evento.key === 'Backspace') {
      evento.preventDefault()
      escribirCantidad('←')
    } else if (evento.key.toLowerCase() === 'c' || evento.key === 'Delete') {
      evento.preventDefault()
      escribirCantidad('C')
    }
  }

  const agregarLinea = () => {
    if (
      !varianteSeleccionada ||
      !precioSeleccionado ||
      !cantidadValida
    ) {
      setError('Selecciona producto, presentación y una cantidad válida.')
      return
    }
    if (seleccionSinStock) {
      setError('El total requerido de esta variante supera el stock disponible.')
      return
    }

    const clave = claveLinea(
      varianteSeleccionada.id,
      precioSeleccionado.presentacion_id,
    )
    const existe = lineas.some((linea) => linea.clave === clave)
    const nuevaLinea = {
      clave,
      variante_id: varianteSeleccionada.id,
      presentacion_id: precioSeleccionado.presentacion_id,
      codigo_sku: varianteSeleccionada.codigo_sku,
      color: varianteSeleccionada.color,
      longitud_cm: varianteSeleccionada.longitud_cm,
      clasificacion: varianteSeleccionada.clasificacion,
      presentacion_nombre: precioSeleccionado.presentacion,
      cantidad_manojos_presentacion: Number(
        precioSeleccionado.cantidad_manojos,
      ),
      cantidad_presentaciones: cantidadNumero,
      precio_unitario: Number(precioSeleccionado.precio),
    }

    setLineas((actuales) =>
      existe
        ? actuales.map((linea) =>
            linea.clave === clave
              ? {
                  ...linea,
                  cantidad_presentaciones:
                    linea.cantidad_presentaciones + cantidadNumero,
                }
              : linea,
          )
        : [...actuales, nuevaLinea],
    )
    setAviso(
      existe
        ? 'La cantidad se sumó a la línea existente.'
        : 'Producto agregado al carrito.',
    )
    setError('')
    setBusquedaProducto('')
    setVarianteId('')
    setPresentacionId('')
    setCantidad('1')

    if (window.matchMedia('(min-width: 821px) and (pointer: fine)').matches) {
      window.setTimeout(() => buscadorProductoRef.current?.focus(), 0)
    }
  }

  const actualizarCantidadLinea = (clave, valor) => {
    if (reintentoPendiente) return
    const cantidadNueva = valor === '' ? 0 : Number(valor)
    if (!Number.isSafeInteger(cantidadNueva) || cantidadNueva > 1000000) return

    setLineas((actuales) =>
      actuales.map((linea) =>
        linea.clave === clave
          ? { ...linea, cantidad_presentaciones: cantidadNueva }
          : linea,
      ),
    )
    setAviso('')
    setError('')
  }

  const eliminarLinea = (clave) => {
    if (reintentoPendiente) return
    setLineas((actuales) => actuales.filter((linea) => linea.clave !== clave))
    setAviso('')
  }

  const reiniciarVenta = async () => {
    if (confirmandoRef.current) return
    setCargando(true)
    setError('')

    try {
      const clave = await crearIntencionVenta()
      setClaveIdempotencia(clave)
      setFormulario(FORMULARIO_INICIAL)
      setLineas([])
      setBusquedaCliente('')
      setBusquedaProducto('')
      setVarianteId('')
      setPresentacionId('')
      setCantidad('1')
      setMontoRecibido('')
      setResultado(null)
      setReintentoPendiente(false)
      setAviso('Nueva intención de venta preparada.')
      await cargarCatalogos()
    } catch (errorPreparacion) {
      setClaveIdempotencia('')
      setError(
        errorPreparacion?.message || 'No fue posible preparar una venta nueva.',
      )
    } finally {
      setCargando(false)
    }
  }

  const solicitarReinicio = () => {
    if (
      hayDatosCapturados &&
      !window.confirm(
        'Se borrarán los datos capturados de esta venta. ¿Deseas continuar?',
      )
    ) {
      return
    }

    reiniciarVenta()
  }

  const emitirRecibo = async () => {
    if (confirmandoRef.current) return

    if (
      !formulario.comprador_nombre.trim() ||
      !formulario.comprador_nit.trim()
    ) {
      setError('Completa el nombre y NIT del comprador.')
      return
    }
    if (!claveIdempotencia) {
      setError('No hay una intención de venta activa. Prepara una venta nueva.')
      return
    }
    if (lineas.length === 0 || lineasInvalidas || lineasSinStock) {
      setError('Revisa las cantidades y el stock del carrito.')
      return
    }
    if (!montoRecibidoValido) {
      setError('Ingresa el monto recibido en efectivo.')
      return
    }
    if (!pagoSuficiente) {
      setError(`Faltan ${formatoMoneda.format(montoFaltante)}.`)
      return
    }
    if (
      !window.confirm(
        `Se confirmará la venta por ${formatoMoneda.format(totalPrevisto)} y se descontará el inventario. ¿Deseas continuar?`,
      )
    ) {
      return
    }

    const datos = {
      cliente_id: formulario.cliente_id || null,
      comprador_nombre: formulario.cliente_id
        ? null
        : formulario.comprador_nombre,
      comprador_nit: formulario.cliente_id ? null : formulario.comprador_nit,
      comprador_direccion: formulario.cliente_id
        ? null
        : formulario.comprador_direccion,
      observaciones: formulario.observaciones,
      monto_recibido: montoRecibido,
      detalles: lineas.map((linea) => ({
        variante_id: linea.variante_id,
        presentacion_id: linea.presentacion_id,
        cantidad_presentaciones: linea.cantidad_presentaciones,
      })),
    }

    confirmandoRef.current = true
    setConfirmando(true)
    setError('')

    try {
      const respuesta = await confirmarVenta(datos, claveIdempotencia)
      setResultado(respuesta)
      setLineas([])
      setReintentoPendiente(false)
      setAviso('')
      await cargarCatalogos()
    } catch (errorConfirmacion) {
      setError(errorConfirmacion?.message || 'No fue posible confirmar la venta.')
      setReintentoPendiente(errorConfirmacion?.status == null)
      if ([401, 403].includes(errorConfirmacion?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      confirmandoRef.current = false
      setConfirmando(false)
    }
  }

  if (cargando && variantes.length === 0) {
    return (
      <section className="estado-ventas" aria-live="polite">
        Preparando punto de venta...
      </section>
    )
  }

  if (resultado) {
    return (
      <section className="resultado-venta" aria-labelledby="titulo-venta-exitosa">
        <span className="icono-venta-exitosa" aria-hidden="true">✓</span>
        <p className="etiqueta-seccion-ventas">Operación completada</p>
        <h2 id="titulo-venta-exitosa">Venta confirmada</h2>
        <p>
          El inventario y el recibo fueron registrados en una sola operación.
        </p>
        <dl>
          <div><dt>Venta</dt><dd>{resultado.venta.numero}</dd></div>
          <div><dt>Recibo</dt><dd>{resultado.recibo.numero}</dd></div>
          <div>
            <dt>Total definitivo</dt>
            <dd>{formatoMoneda.format(Number(resultado.venta.total))}</dd>
          </div>
          <div>
            <dt>Recibido</dt>
            <dd>{formatoMoneda.format(Number(resultado.venta.monto_recibido))}</dd>
          </div>
          <div>
            <dt>Cambio</dt>
            <dd>{formatoMoneda.format(Number(resultado.venta.cambio))}</dd>
          </div>
        </dl>
        {!resultado.cambio && (
          <p className="aviso-idempotencia-ventas">
            Este fue un reintento seguro: no se descontó inventario dos veces.
          </p>
        )}
        <div className="acciones-resultado-venta">
          {puedeVer && (
            <>
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={() => alVerVenta(resultado.venta.id)}
              >
                Ver recibo
              </button>
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={() => alVerVenta(resultado.venta.id, true)}
              >
                Imprimir recibo
              </button>
            </>
          )}
          <button
            className="boton-primario-ventas"
            type="button"
            onClick={reiniciarVenta}
          >
            Nueva venta
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="pos-ventas">
      <div className="acciones-superiores-pos-ventas">
        <button
          className="boton-secundario-ventas"
          type="button"
          onClick={solicitarReinicio}
          disabled={cargando || confirmando}
        >
          Limpiar venta
        </button>
      </div>
      {error && (
        <div className="mensaje-ventas mensaje-error-ventas" role="alert">
          <span>{error}</span>
          {reintentoPendiente && (
            <small>
              El resultado es incierto. Reintenta sin cambiar el carrito o
              descarta esta intención para iniciar otra.
            </small>
          )}
        </div>
      )}
      {aviso && <p className="mensaje-ventas mensaje-exito-ventas">{aviso}</p>}

      {reintentoPendiente && (
        <div className="acciones-reintento-ventas">
          <button
            className="boton-secundario-ventas"
            type="button"
            onClick={solicitarReinicio}
          >
            Descartar intento y crear otro
          </button>
          <span>La clave actual se conserva para un reintento seguro.</span>
        </div>
      )}

      <section className="tarjeta-pos-ventas comprador-ventas" aria-labelledby="comprador-venta">
        <div className="titulo-paso-ventas">
          <span>1</span>
          <div>
            <h2 id="comprador-venta">Comprador</h2>
            <p>Ingresa los datos del comprador o selecciona un cliente registrado.</p>
          </div>
        </div>
        <div className="buscador-cliente-ventas">
          {clienteSeleccionado ? (
            <div className="cliente-seleccionado-ventas">
              <div>
                <span>Cliente registrado seleccionado</span>
                <strong>{nombreCliente(clienteSeleccionado)}</strong>
                <small>NIT {clienteSeleccionado.nit}</small>
              </div>
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={quitarClienteSeleccionado}
                disabled={reintentoPendiente}
              >
                Quitar o cambiar cliente
              </button>
            </div>
          ) : (
            <>
              <div className="campo-ventas">
                <label htmlFor="buscar-cliente-venta">Buscar cliente registrado</label>
                <div className="control-con-boton-ventas">
                  <input
                    id="buscar-cliente-venta"
                    value={busquedaCliente}
                    onChange={(evento) => setBusquedaCliente(evento.target.value)}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.preventDefault()
                        buscarClientes()
                      }
                    }}
                    maxLength={150}
                    placeholder="Nombre, empresa o NIT"
                    disabled={reintentoPendiente}
                  />
                  <button
                    className="boton-secundario-ventas"
                    type="button"
                    onClick={buscarClientes}
                    disabled={consultandoClientes || reintentoPendiente}
                  >
                    {consultandoClientes ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>
              <div className="campo-ventas">
                <label htmlFor="cliente-venta">Resultados</label>
                <select
                  id="cliente-venta"
                  value=""
                  onChange={(evento) => seleccionarCliente(evento.target.value)}
                  disabled={reintentoPendiente}
                >
                  <option value="">Selecciona un cliente registrado</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {nombreCliente(cliente)} · NIT {cliente.nit}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="campos-comprador-ventas">
          <div className="campo-ventas campo-ancho-ventas">
            <label htmlFor="nombre-comprador-venta">Nombre *</label>
            <input
              id="nombre-comprador-venta"
              name="comprador_nombre"
              value={formulario.comprador_nombre}
              onChange={actualizarFormulario}
              maxLength={200}
              disabled={Boolean(formulario.cliente_id) || reintentoPendiente}
            />
          </div>
          <div className="campo-ventas campo-nit-ventas">
            <label htmlFor="nit-comprador-venta">NIT *</label>
            <div className="control-nit-ventas">
              <input
                id="nit-comprador-venta"
                name="comprador_nit"
                value={formulario.comprador_nit}
                onChange={actualizarFormulario}
                maxLength={30}
                placeholder="Ej. 1234567-8"
                disabled={Boolean(formulario.cliente_id) || reintentoPendiente}
              />
              <button
                className="boton-secundario-ventas boton-cf-ventas"
                type="button"
                onClick={() => {
                  setFormulario((actual) => ({
                    ...actual,
                    comprador_nit: 'CF',
                  }))
                  setError('')
                }}
                disabled={Boolean(formulario.cliente_id) || reintentoPendiente}
              >
                Usar CF
              </button>
            </div>
          </div>
          <div className="campo-ventas campo-ancho-ventas">
            <label htmlFor="direccion-comprador-venta">Dirección</label>
            <input
              id="direccion-comprador-venta"
              name="comprador_direccion"
              value={formulario.comprador_direccion}
              onChange={actualizarFormulario}
              maxLength={500}
              disabled={Boolean(formulario.cliente_id) || reintentoPendiente}
            />
          </div>
        </div>
      </section>

      <div className="rejilla-captura-ventas">
        <section className="tarjeta-pos-ventas producto-ventas" aria-labelledby="producto-venta">
          <div className="titulo-paso-ventas">
            <span>2</span>
            <div>
              <h2 id="producto-venta">Producto y presentación</h2>
              <p>Los precios son consultados desde PostgreSQL.</p>
            </div>
          </div>
          <div className="campo-ventas">
            <label htmlFor="buscar-producto-venta">Buscar variante</label>
            <div className="control-con-boton-ventas">
              <input
                id="buscar-producto-venta"
                ref={buscadorProductoRef}
                value={busquedaProducto}
                onChange={(evento) => setBusquedaProducto(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') {
                    evento.preventDefault()
                    buscarProductos()
                  }
                }}
                maxLength={150}
                placeholder="SKU o color"
                disabled={reintentoPendiente}
              />
              <button
                className="boton-secundario-ventas"
                type="button"
                onClick={buscarProductos}
                disabled={consultandoProductos || reintentoPendiente}
              >
                {consultandoProductos ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
          <div className="campo-ventas">
            <label htmlFor="variante-venta">Variante *</label>
            <select
              id="variante-venta"
              value={varianteId}
              onChange={(evento) => {
                setVarianteId(evento.target.value)
                setPresentacionId('')
                setError('')
              }}
              disabled={reintentoPendiente}
            >
              <option value="">Selecciona una variante</option>
              {variantes.map((variante) => (
                <option key={variante.id} value={variante.id}>
                  {variante.codigo_sku} · {variante.color} · {variante.longitud_cm} cm · {variante.clasificacion}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-ventas">
            <label htmlFor="presentacion-venta">Presentación *</label>
            <select
              id="presentacion-venta"
              value={presentacionId}
              onChange={(evento) => {
                setPresentacionId(evento.target.value)
                setError('')
              }}
              disabled={!varianteSeleccionada || reintentoPendiente}
            >
              <option value="">Selecciona una presentación</option>
              {preciosDisponibles.map((precio) => (
                <option key={precio.presentacion_id} value={precio.presentacion_id}>
                  {precio.presentacion} · {formatoMoneda.format(Number(precio.precio))}
                </option>
              ))}
            </select>
            {varianteSeleccionada && preciosDisponibles.length === 0 && (
              <small>No hay presentaciones activas con precio vigente.</small>
            )}
          </div>

          <div className={`vista-previa-venta${seleccionSinStock ? ' vista-previa-sin-stock' : ''}`}>
            <dl>
              <div><dt>Producto</dt><dd>{varianteSeleccionada ? `${varianteSeleccionada.color} · ${varianteSeleccionada.longitud_cm} cm · ${varianteSeleccionada.clasificacion}` : '—'}</dd></div>
              <div><dt>Presentación</dt><dd>{precioSeleccionado?.presentacion ?? '—'}</dd></div>
              <div><dt>Precio</dt><dd>{precioSeleccionado ? formatoMoneda.format(Number(precioSeleccionado.precio)) : '—'}</dd></div>
              <div><dt>Estado</dt><dd>{varianteSeleccionada ? 'Activa' : '—'}</dd></div>
              <div><dt>Disponible</dt><dd>{varianteSeleccionada ? `${stockSeleccionado} manojos` : '—'}</dd></div>
              <div><dt>Esta línea requiere</dt><dd>{manojosSeleccionados} manojos</dd></div>
              <div><dt>En carrito actualmente</dt><dd>{consumoCarritoVariante} manojos</dd></div>
              <div><dt>Después de venta</dt><dd>{varianteSeleccionada ? `${stockRestantePrevisto} manojos` : '—'}</dd></div>
              <div className="subtotal-previo-ventas"><dt>Subtotal</dt><dd>{formatoMoneda.format(precioSeleccionado && cantidadValida ? Number(precioSeleccionado.precio) * cantidadNumero : 0)}</dd></div>
            </dl>
            {seleccionSinStock && (
              <p role="alert">Stock insuficiente para el consumo total de esta variante.</p>
            )}
            {!seleccionSinStock && varianteSeleccionada && stockRestantePrevisto === 0 && (
              <p className="aviso-stock-previsto-ventas">Quedará sin stock.</p>
            )}
            {!seleccionSinStock &&
              varianteSeleccionada &&
              stockRestantePrevisto > 0 &&
              stockRestantePrevisto <= stockMinimoSeleccionado && (
                <p className="aviso-stock-previsto-ventas">Quedará en stock bajo.</p>
              )}
          </div>
        </section>

        <section
          className="tarjeta-pos-ventas calculadora-ventas"
          aria-labelledby="cantidad-venta"
          onKeyDown={manejarTecladoCalculadora}
        >
          <div className="titulo-paso-ventas">
            <span>3</span>
            <div>
              <h2 id="cantidad-venta">Cantidad</h2>
              <p>Unidades de la presentación seleccionada.</p>
            </div>
          </div>
          <label htmlFor="pantalla-cantidad-venta">Cantidad</label>
          <input
            id="pantalla-cantidad-venta"
            className="pantalla-calculadora-ventas"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={cantidad}
            onChange={(evento) => {
              const valor = evento.target.value.replace(/\D/g, '').slice(0, 7)
              setCantidad(valor.replace(/^0+(?=\d)/, ''))
              setError('')
            }}
            onKeyDown={(evento) => {
              evento.stopPropagation()
              if (evento.key.toLowerCase() === 'c' || evento.key === 'Delete') {
                evento.preventDefault()
                escribirCantidad('C')
              }
            }}
            disabled={reintentoPendiente}
          />
          <div className="teclado-ventas" aria-label="Teclado numérico">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '←'].map((tecla) => (
              <button
                key={tecla}
                className={tecla === 'C' || tecla === '←' ? 'tecla-funcion-ventas' : ''}
                type="button"
                onClick={() => escribirCantidad(tecla)}
                disabled={reintentoPendiente}
                aria-label={tecla === '←' ? 'Borrar último dígito' : tecla === 'C' ? 'Limpiar cantidad' : undefined}
              >
                {tecla}
              </button>
            ))}
          </div>
          <button
            className="boton-agregar-ventas"
            type="button"
            onClick={agregarLinea}
            disabled={
              reintentoPendiente ||
              !varianteSeleccionada ||
              !precioSeleccionado ||
              !cantidadValida ||
              seleccionSinStock
            }
          >
            Agregar al carrito
          </button>
          <small className="ayuda-teclado-ventas">
            También puedes usar el teclado físico, C y retroceso.
          </small>
        </section>
      </div>

      <section className="tarjeta-pos-ventas carrito-ventas" aria-labelledby="carrito-venta">
        <div className="encabezado-carrito-ventas">
          <div className="titulo-paso-ventas">
            <span>4</span>
            <div>
              <h2 id="carrito-venta">Carrito de venta</h2>
              <p>{lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'} agregadas</p>
            </div>
          </div>
          <div className="total-carrito-ventas">
            <span>Total previsto</span>
            <strong>{formatoMoneda.format(totalPrevisto)}</strong>
            <small>PostgreSQL calcula el total definitivo.</small>
          </div>
        </div>

        {lineas.length === 0 ? (
          <p className="estado-carrito-ventas">Aún no has agregado productos.</p>
        ) : (
          <div className="desplazamiento-tabla-ventas">
            <table className="tabla-carrito-ventas">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Presentación</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Manojos</th>
                  <th scope="col">Precio</th>
                  <th scope="col">Subtotal</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => {
                  const requerido = consumoPorVariante.get(linea.variante_id) ?? 0
                  const disponible = Number(
                    existencias.get(linea.variante_id)?.stock_manojos ?? 0,
                  )
                  const sinStock = requerido > disponible

                  return (
                    <tr key={linea.clave} className={sinStock ? 'linea-sin-stock-ventas' : ''}>
                      <td data-label="Producto">
                        <strong>{linea.codigo_sku}</strong>
                        <small>{linea.color} · {linea.longitud_cm} cm · {linea.clasificacion}</small>
                        {sinStock && <em>Requiere {requerido}; disponible {disponible}</em>}
                      </td>
                      <td data-label="Presentación">
                        <strong>{linea.presentacion_nombre}</strong>
                        <small>
                          {formatearManojosPorUnidad(
                            linea.cantidad_manojos_presentacion,
                          )}
                        </small>
                      </td>
                      <td data-label="Cantidad">
                        <input
                          className="cantidad-linea-ventas"
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          value={linea.cantidad_presentaciones || ''}
                          onChange={(evento) => actualizarCantidadLinea(linea.clave, evento.target.value)}
                          disabled={reintentoPendiente}
                          aria-label={`Cantidad para ${linea.codigo_sku} ${linea.presentacion_nombre}`}
                        />
                      </td>
                      <td data-label="Manojos">{linea.cantidad_presentaciones * linea.cantidad_manojos_presentacion}</td>
                      <td data-label="Precio">{formatoMoneda.format(linea.precio_unitario)}</td>
                      <td data-label="Subtotal"><strong>{formatoMoneda.format(linea.precio_unitario * linea.cantidad_presentaciones)}</strong></td>
                      <td data-label="Acción">
                        <button
                          className="boton-texto-peligro-ventas"
                          type="button"
                          onClick={() => eliminarLinea(linea.clave)}
                          disabled={reintentoPendiente}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="cierre-pos-ventas">
          <div className="campo-ventas observaciones-ventas">
            <label htmlFor="observaciones-venta">Observaciones</label>
            <textarea
              id="observaciones-venta"
              name="observaciones"
              value={formulario.observaciones}
              onChange={actualizarFormulario}
              maxLength={1000}
              rows="3"
              placeholder="Información adicional de la venta"
              disabled={reintentoPendiente}
            />
          </div>
          <div className="cobro-ventas">
            <section className="panel-pago-ventas" aria-labelledby="pago-venta">
              <div className="encabezado-pago-ventas">
                <div>
                  <span>Método de pago</span>
                  <strong>Efectivo</strong>
                </div>
                <div className="total-pago-ventas">
                  <span id="pago-venta">Total</span>
                  <strong>{formatoMoneda.format(totalPrevisto)}</strong>
                </div>
              </div>
              <label htmlFor="monto-recibido-venta">Pago recibido *</label>
              <div className="control-monto-ventas">
                <span aria-hidden="true">Q</span>
                <input
                  id="monto-recibido-venta"
                  type="text"
                  inputMode="decimal"
                  value={montoRecibido}
                  onChange={(evento) => actualizarMontoRecibido(evento.target.value)}
                  onBlur={() => {
                    if (montoRecibidoValido) {
                      setMontoRecibido(montoRecibidoNumero.toFixed(2))
                    }
                  }}
                  placeholder="0.00"
                  disabled={reintentoPendiente}
                  aria-describedby="resultado-pago-venta"
                />
                <button
                  className="boton-secundario-ventas"
                  type="button"
                  onClick={() => {
                    setMontoRecibido(totalPrevisto.toFixed(2))
                    setError('')
                  }}
                  disabled={lineas.length === 0 || reintentoPendiente}
                >
                  Exacto
                </button>
              </div>
              <div className="atajos-pago-ventas" aria-label="Montos rápidos">
                {[50, 100, 200, 500].map((monto) => (
                  <button
                    key={monto}
                    className="boton-secundario-ventas"
                    type="button"
                    onClick={() => {
                      setMontoRecibido(monto.toFixed(2))
                      setError('')
                    }}
                    disabled={reintentoPendiente}
                  >
                    Q{monto}
                  </button>
                ))}
              </div>
              <div
                id="resultado-pago-venta"
                className={`resultado-pago-ventas${
                  montoRecibidoValido && !pagoSuficiente
                    ? ' resultado-pago-insuficiente-ventas'
                    : ''
                }`}
                aria-live="polite"
              >
                {!montoRecibidoValido ? (
                  <><span>Pago recibido</span><strong>Ingresa un monto válido</strong></>
                ) : pagoSuficiente ? (
                  <><span>Cambio</span><strong>{formatoMoneda.format(cambioPrevisto)}</strong></>
                ) : (
                  <><span>Faltan</span><strong>{formatoMoneda.format(montoFaltante)}</strong></>
                )}
              </div>
            </section>
            <button
              className="boton-emitir-ventas"
              type="button"
              onClick={emitirRecibo}
              disabled={
                confirmando ||
                lineas.length === 0 ||
                lineasInvalidas ||
                lineasSinStock ||
                !montoRecibidoValido ||
                !pagoSuficiente ||
                !claveIdempotencia
              }
            >
              {confirmando ? 'Confirmando venta...' : reintentoPendiente ? 'Reintentar emisión' : 'Emitir recibo'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default VentaPos
