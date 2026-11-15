import { useEffect, useMemo, useRef, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import ClienteDialog from './ClienteDialog'
import { listarClientes } from '../services/clientes'
import { listarInventario } from '../services/inventario'
import { listarLotesOperativos } from '../services/operaciones'
import { listarVariantes } from '../services/productos'
import {
  confirmarVenta,
  confirmarVentaCredito,
  crearPagoStripe,
  crearIntencionVenta,
  obtenerVenta,
} from '../services/ventas'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Eye,
  FileDown,
  FileText,
  List,
  PackageSearch,
  Boxes,
  Info,
  Layers3,
  Printer,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Scale,
  SlidersHorizontal,
  Tag,
  X,
  Trash2,
  UserPlus,
} from 'lucide-react'
import logoEfarm from '../assets/logo-efarm-brand.png'
import {
  crearDocumentoVenta,
  imprimirTicket,
} from '../utils/documentosComerciales'
import { descargarPDFFormal, verPDFFormal } from '../utils/documentosFormales'
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

const precioEstaEnRango = (precio, minimo, maximo) => {
  const valor = Number(precio)
  if (!Number.isFinite(valor)) return false
  if (minimo !== null && Number.isFinite(minimo) && valor < minimo) return false
  if (maximo !== null && Number.isFinite(maximo) && valor > maximo) return false
  return true
}

const DOCUMENTO_RECIBO = 'recibo'
const DOCUMENTO_FACTURA = 'factura-demostracion'
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

function FormularioPagoStripe({ alConfirmar, deshabilitado }) {
  const stripe = useStripe()
  const elements = useElements()
  const [procesando, setProcesando] = useState(false)
  const [pagoConfirmado, setPagoConfirmado] = useState(false)
  const [error, setError] = useState('')

  const confirmarPago = async () => {
    if (!stripe || !elements || procesando || pagoConfirmado || deshabilitado) return
    setProcesando(true)
    setError('')
    try {
      const resultado = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })

      if (resultado.error) {
        if (
          resultado.error.payment_intent?.status === 'succeeded' &&
          resultado.error.payment_intent.id
        ) {
          console.info('[stripe] PaymentIntent ya estaba confirmado.', {
            paymentIntentId: resultado.error.payment_intent.id,
          })
          setPagoConfirmado(true)
          alConfirmar(resultado.error.payment_intent.id)
          return
        }

        console.error('[stripe] Error al confirmar el pago.', {
          tipo: resultado.error.type,
          codigo: resultado.error.code,
          mensaje: resultado.error.message,
          declineCode: resultado.error.decline_code,
        })
        setError(resultado.error.message ?? 'No fue posible confirmar el pago.')
      } else if (resultado.paymentIntent?.status === 'succeeded') {
        setPagoConfirmado(true)
        alConfirmar(resultado.paymentIntent.id)
      } else {
        setError('El pago requiere una acción adicional o no fue confirmado.')
      }
    } catch (errorPago) {
      console.error('[stripe] Error inesperado al confirmar el pago.', errorPago)
      setError('No fue posible confirmar el pago. Revisa la configuración de Stripe.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="formulario-stripe-ventas">
      <PaymentElement options={{ layout: 'accordion' }} />
      {error && <p className="error-pago-stripe-ventas" role="alert">{error}</p>}
      <button className="boton-pago-stripe-ventas" type="button" onClick={confirmarPago} disabled={!stripe || !elements || procesando || pagoConfirmado || deshabilitado}>
        {procesando ? 'Confirmando pago...' : pagoConfirmado ? 'Pago confirmado' : 'Confirmar pago con tarjeta'}
      </button>
    </div>
  )
}

function VentaPos({ puedeVer, alVerVenta, alRefrescarAutorizacion, alActualizarBorrador }) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [clientes, setClientes] = useState([])
  const [variantes, setVariantes] = useState([])
  const [existencias, setExistencias] = useState(new Map())
  const [presentacionesActivas, setPresentacionesActivas] = useState(new Set())
  const [lineas, setLineas] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [precioMinimo, setPrecioMinimo] = useState('')
  const [precioMaximo, setPrecioMaximo] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const [presentacionId, setPresentacionId] = useState('')
  const [detalleProductoAbierto, setDetalleProductoAbierto] = useState(false)
  const [cantidad, setCantidad] = useState('1')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [stripeClientSecret, setStripeClientSecret] = useState('')
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState('')
  const [stripeMontoPreparado, setStripeMontoPreparado] = useState(null)
  const [preparandoPagoStripe, setPreparandoPagoStripe] = useState(false)
  const [claveIdempotencia, setClaveIdempotencia] = useState('')
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [documentoConfirmando, setDocumentoConfirmando] = useState(null)
  const [pasoActual, setPasoActual] = useState(1)
  const [clienteDialogoAbierto, setClienteDialogoAbierto] = useState(false)
  const [versionClienteDialogo, setVersionClienteDialogo] = useState(0)
  const [reintentoPendiente, setReintentoPendiente] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [detalleConfirmado, setDetalleConfirmado] = useState(null)
  const [documentosCargando, setDocumentosCargando] = useState(false)
  const [documentosProcesando, setDocumentosProcesando] = useState(false)
  const [documentosError, setDocumentosError] = useState('')
  const [tipoDocumentoAcceso, setTipoDocumentoAcceso] = useState(DOCUMENTO_RECIBO)
  const resultadoActivoRef = useRef(null)
  const confirmandoRef = useRef(false)
  const buscadorProductoRef = useRef(null)
  const montoRecibidoRef = useRef(null)

  useEffect(() => {
    const tieneDatos = Object.values(formulario).some((valor) => String(valor).trim() !== '')
      || lineas.length > 0
      || busquedaCliente.trim() !== ''
      || busquedaProducto.trim() !== ''
      || varianteId !== ''
      || presentacionId !== ''
      || cantidad !== '1'
      || montoRecibido.trim() !== ''
      || metodoPago !== 'efectivo'

    alActualizarBorrador?.(tieneDatos)
  }, [
    alActualizarBorrador,
    busquedaCliente,
    busquedaProducto,
    cantidad,
    formulario,
    lineas,
    metodoPago,
    montoRecibido,
    presentacionId,
    varianteId,
  ])

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
    let lotes = []

    try {
      lotes = await listarLotesOperativos()
    } catch (errorLotes) {
      // El inventario histórico sigue permitiendo operar el POS mientras el
      // catálogo operativo de lotes se recupera o se termina de configurar.
      if (![401, 403, 500].includes(errorLotes?.status)) throw errorLotes
    }

    setVariantes(resultadoVariantes.variantes)
    setExistencias((actuales) => {
      const siguientes = new Map(actuales)
      resultadoInventario.inventario.forEach((item) => {
        siguientes.set(item.variante_id, item)
      })

      const variantesConLotes = new Set()
      const stockPorVariante = new Map()
      lotes.forEach((lote) => {
        if (!lote.variante_id) return
        variantesConLotes.add(lote.variante_id)
        if (lote.estado !== 'liberado') return
        stockPorVariante.set(
          lote.variante_id,
          (stockPorVariante.get(lote.variante_id) ?? 0) +
            Number(lote.cantidad_disponible ?? 0),
        )
      })
      variantesConLotes.forEach((id) => {
        siguientes.set(id, {
          ...(siguientes.get(id) ?? { variante_id: id }),
          stock_manojos: stockPorVariante.get(id) ?? 0,
        })
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
  const precioMinimoNumero = precioMinimo.trim() === '' ? null : Number(precioMinimo)
  const precioMaximoNumero = precioMaximo.trim() === '' ? null : Number(precioMaximo)
  const rangoPrecios = useMemo(() => {
    const precios = variantes.flatMap((variante) => (variante.precios ?? []))
      .filter((precio) => presentacionesActivas.has(precio.presentacion_id))
      .map((precio) => Number(precio.precio))
      .filter((precio) => Number.isFinite(precio))
    if (precios.length === 0) return { minimo: 0, maximo: 1 }
    const minimo = Math.min(...precios)
    return { minimo, maximo: Math.max(minimo + 0.01, Math.max(...precios)) }
  }, [presentacionesActivas, variantes])
  const precioMinimoSlider = precioMinimoNumero ?? rangoPrecios.minimo
  const precioMaximoSlider = precioMaximoNumero ?? rangoPrecios.maximo
  const filtroPrecioActivo =
    (precioMinimoNumero !== null && Number.isFinite(precioMinimoNumero)) ||
    (precioMaximoNumero !== null && Number.isFinite(precioMaximoNumero))
  const preciosDisponibles = (varianteSeleccionada?.precios ?? []).filter(
    (precio) => presentacionesActivas.has(precio.presentacion_id) && (!filtroPrecioActivo || precioEstaEnRango(precio.precio, precioMinimoNumero, precioMaximoNumero)),
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
  const variantesVisibles = useMemo(() => {
    const termino = busquedaProducto.trim().toLocaleLowerCase()
    return variantes.filter((variante) => {
      const coincideTexto = !termino || [
        variante.codigo_sku,
        variante.color,
        variante.clasificacion,
        variante.longitud_cm,
      ]
        .filter((valor) => valor !== undefined && valor !== null)
        .some((valor) => String(valor).toLocaleLowerCase().includes(termino))
      const coincidePrecio = !filtroPrecioActivo || (variante.precios ?? [])
        .filter((precio) => presentacionesActivas.has(precio.presentacion_id))
        .some((precio) => precioEstaEnRango(precio.precio, precioMinimoNumero, precioMaximoNumero))
      return coincideTexto && coincidePrecio
    })
  }, [busquedaProducto, filtroPrecioActivo, precioMaximoNumero, precioMinimoNumero, presentacionesActivas, variantes])
  const clientesVisibles = useMemo(() => {
    const termino = busquedaCliente.trim().toLocaleLowerCase()
    if (!termino) return clientes

    return clientes.filter((cliente) =>
      [nombreCliente(cliente), cliente.nit, cliente.razon_social]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase().includes(termino)),
    )
  }, [busquedaCliente, clientes])
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
    montoRecibidoNumero >= 0 &&
    montoRecibidoNumero <= 999999999999.99
  const cuentaCliente = Boolean(formulario.cliente_id)
  const diferenciaPago = montoRecibidoValido
    ? Math.round((montoRecibidoNumero - totalPrevisto) * 100) / 100
    : null
  const pagoSuficiente = diferenciaPago !== null && diferenciaPago >= 0
  const cambioPrevisto = pagoSuficiente ? diferenciaPago : 0
  const montoFaltante = diferenciaPago !== null && diferenciaPago < 0
    ? Math.abs(diferenciaPago)
    : 0
  const stripePagoValido = Boolean(
    stripePaymentIntentId && stripeMontoPreparado === totalPrevisto,
  )
  const emisionDeshabilitada =
    confirmando ||
    lineas.length === 0 ||
    lineasInvalidas ||
    lineasSinStock ||
    (metodoPago === 'efectivo' && (!montoRecibidoValido || (!cuentaCliente && !pagoSuficiente))) ||
    (metodoPago === 'tarjeta' && !stripePagoValido) ||
    !claveIdempotencia

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

  const abrirNuevoCliente = () => {
    setVersionClienteDialogo((version) => version + 1)
    setClienteDialogoAbierto(true)
  }

  const manejarClienteCreado = (cliente) => {
    setClientes((actuales) => [
      cliente,
      ...actuales.filter((actual) => actual.id !== cliente.id),
    ])
    setFormulario((actual) => ({
      ...actual,
      cliente_id: cliente.id,
      comprador_nombre: nombreCliente(cliente),
      comprador_nit: cliente.nit ?? '',
      comprador_direccion: cliente.direccion ?? '',
    }))
    setBusquedaCliente('')
    setClienteDialogoAbierto(false)
    setError('')
    setAviso('Cliente creado y seleccionado para esta venta.')
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

    setCantidad(cantidadNueva > 0 ? String(cantidadNueva) : '')

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
      resultadoActivoRef.current = null
      setResultado(null)
      setDetalleConfirmado(null)
      setDocumentosError('')
      setDocumentosCargando(false)
      setDocumentosProcesando(false)
      setTipoDocumentoAcceso(DOCUMENTO_RECIBO)
      setReintentoPendiente(false)
      setPasoActual(1)
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

  const continuarCliente = () => {
    if (
      !formulario.cliente_id &&
      (!formulario.comprador_nombre.trim() || !formulario.comprador_nit.trim())
    ) {
      setError('Selecciona un cliente o completa el nombre y NIT del comprador.')
      return
    }

    setError('')
    setPasoActual(2)
  }

  const continuarProductos = () => {
    if (lineas.length === 0) {
      setError('Agrega al menos un producto para continuar al cobro.')
      return
    }

    setError('')
    setPasoActual(3)
  }

  const prepararPagoConTarjeta = async () => {
    if (!stripePromise || !claveIdempotencia || lineas.length === 0 || lineasInvalidas || lineasSinStock) {
      setError('Stripe no está configurado o el carrito todavía no es válido.')
      return
    }
    setPreparandoPagoStripe(true)
    setError('')
    try {
      const pago = await crearPagoStripe(totalPrevisto.toFixed(2), claveIdempotencia)
      setStripeClientSecret(pago.client_secret)
      setStripePaymentIntentId('')
      setStripeMontoPreparado(totalPrevisto)
    } catch (errorPago) {
      setError(errorPago.message ?? 'No fue posible preparar el pago con tarjeta.')
    } finally {
      setPreparandoPagoStripe(false)
    }
  }

  const confirmarVentaYEmitir = async (tipoDocumento) => {
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
    if (metodoPago === 'efectivo' && !montoRecibidoValido) {
      setError('Ingresa el monto recibido en efectivo.')
      return
    }
    if (metodoPago === 'efectivo' && !cuentaCliente && !pagoSuficiente) {
      setError(`Faltan ${formatoMoneda.format(montoFaltante)}.`)
      return
    }
    if (metodoPago === 'tarjeta' && !stripePagoValido) {
      setError('Confirma el pago con tarjeta antes de emitir el documento.')
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
      monto_recibido: metodoPago === 'efectivo' ? montoRecibido : totalPrevisto.toFixed(2),
      metodo_pago: metodoPago,
      stripe_payment_intent_id: metodoPago === 'tarjeta' ? stripePaymentIntentId : null,
      detalles: lineas.map((linea) => ({
        variante_id: linea.variante_id,
        presentacion_id: linea.presentacion_id,
        cantidad_presentaciones: linea.cantidad_presentaciones,
      })),
    }

    confirmandoRef.current = true
    setConfirmando(true)
    setDocumentoConfirmando(tipoDocumento)
    setError('')

    try {
      const esVentaCredito =
        metodoPago === 'efectivo' &&
        Boolean(formulario.cliente_id) &&
        montoRecibidoNumero < totalPrevisto
      const respuesta = esVentaCredito
        ? await confirmarVentaCredito(datos, claveIdempotencia)
        : await confirmarVenta(datos, claveIdempotencia)
      resultadoActivoRef.current = respuesta.venta.id
      setTipoDocumentoAcceso(tipoDocumento)
      setDetalleConfirmado(null)
      setDocumentosError('')
      setResultado(respuesta)
      setLineas([])
      setReintentoPendiente(false)
      setAviso('')

      // La venta YA fue confirmada. Consultar sus documentos es de solo lectura:
      // si falla esta consulta, jamás volvemos a enviar el cobro.
      if (puedeVer) {
        setDocumentosCargando(true)
        try {
          const detalleGuardado = await obtenerVenta(respuesta.venta.id)
          if (resultadoActivoRef.current === respuesta.venta.id) {
            setDetalleConfirmado(detalleGuardado)
          }
        } catch (errorLectura) {
          if (resultadoActivoRef.current === respuesta.venta.id) {
            setDocumentosError(
              errorLectura?.message ||
                'La venta se guardó, pero no fue posible cargar el documento.',
            )
          }
        } finally {
          if (resultadoActivoRef.current === respuesta.venta.id) {
            setDocumentosCargando(false)
          }
        }
      }
    } catch (errorConfirmacion) {
      setError(errorConfirmacion?.message || 'No fue posible confirmar la venta.')
      setReintentoPendiente(errorConfirmacion?.status == null)
      if ([401, 403].includes(errorConfirmacion?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      confirmandoRef.current = false
      setConfirmando(false)
      setDocumentoConfirmando(null)
    }
  }

  const recargarDocumentoConfirmado = async () => {
    const ventaId = resultado?.venta?.id
    if (!ventaId || !puedeVer || documentosCargando) return
    setDocumentosCargando(true)
    setDocumentosError('')
    try {
      const detalleGuardado = await obtenerVenta(ventaId)
      if (resultadoActivoRef.current === ventaId) {
        setDetalleConfirmado(detalleGuardado)
      }
    } catch (errorLectura) {
      if (resultadoActivoRef.current === ventaId) {
        setDocumentosError(
          errorLectura?.message || 'No fue posible consultar el documento.',
        )
      }
    } finally {
      if (resultadoActivoRef.current === ventaId) {
        setDocumentosCargando(false)
      }
    }
  }

  const ejecutarAccesoDocumento = async (accion) => {
    if (!detalleConfirmado || documentosProcesando) return
    setDocumentosProcesando(true)
    try {
      const documento = crearDocumentoVenta(detalleConfirmado, tipoDocumentoAcceso)
      if (accion === 'vista') await verPDFFormal(documento, logoEfarm)
      if (accion === 'descargar') await descargarPDFFormal(documento, logoEfarm)
      if (accion === 'imprimir') imprimirTicket(documento, logoEfarm)
      setDocumentosError('')
    } catch (errorDocumento) {
      setDocumentosError(
        errorDocumento?.message || 'No fue posible preparar el documento.',
      )
    } finally {
      setDocumentosProcesando(false)
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
    const documentosListos = puedeVer && Boolean(detalleConfirmado) && !documentosCargando && !documentosProcesando

    return (
      <section className="resultado-venta resultado-venta-efarm" aria-labelledby="titulo-venta-exitosa">
        <div className="resultado-venta-titulo-efarm">
          <CheckCircle2 size={24} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <h2 id="titulo-venta-exitosa">Venta confirmada</h2>
            <p>Venta {resultado.venta.numero} · Recibo {resultado.recibo.numero}</p>
          </div>
        </div>

        <dl className="resultado-venta-importes-efarm">
          <div><dt>Total</dt><dd>{formatoMoneda.format(Number(resultado.venta.total))}</dd></div>
          <div><dt>Recibido</dt><dd>{formatoMoneda.format(Number(resultado.venta.monto_recibido))}</dd></div>
          <div><dt>Cambio</dt><dd>{formatoMoneda.format(Number(resultado.venta.cambio))}</dd></div>
        </dl>

        {!resultado.cambio && (
          <p className="aviso-idempotencia-ventas">
            Reintento seguro: no se descontó inventario dos veces.
          </p>
        )}

        {puedeVer ? (
          <div className="documentos-resultado-efarm" aria-label="Documentos de esta venta">
            <div className="documentos-resultado-encabezado-efarm">
              <strong>Comprobante</strong>
              <label htmlFor="documento-rapido-venta">
                <span>Tipo</span>
                <select
                  id="documento-rapido-venta"
                  value={tipoDocumentoAcceso}
                  onChange={(evento) => setTipoDocumentoAcceso(evento.target.value)}
                >
                  <option value={DOCUMENTO_RECIBO}>Recibo</option>
                  <option value={DOCUMENTO_FACTURA}>Factura de prueba</option>
                </select>
              </label>
            </div>
            <div className="acciones-documentos-resultado-efarm">
              <button type="button" className="boton-secundario-ventas" disabled={!documentosListos} onClick={() => ejecutarAccesoDocumento('vista')}>
                <Eye size={16} aria-hidden="true" />
                Vista previa
              </button>
              <button type="button" className="boton-secundario-ventas" disabled={!documentosListos} onClick={() => ejecutarAccesoDocumento('descargar')}>
                <FileDown size={16} aria-hidden="true" />
                Descargar PDF
              </button>
              <button type="button" className="boton-primario-ventas" disabled={!documentosListos} onClick={() => ejecutarAccesoDocumento('imprimir')}>
                <Printer size={16} aria-hidden="true" />
                Imprimir
              </button>
            </div>
            {documentosCargando && <p className="estado-documento-rapido-efarm" role="status">Preparando documento...</p>}
            {documentosError && (
              <div className="error-documento-rapido-efarm" role="alert">
                <p>La venta sí quedó guardada. {documentosError}</p>
                <button className="boton-secundario-ventas" type="button" disabled={documentosCargando} onClick={recargarDocumentoConfirmado}>
                  Reintentar documento
                </button>
              </div>
            )}
            {tipoDocumentoAcceso === DOCUMENTO_FACTURA && (
              <p className="aviso-fiscal-rapido-efarm">DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL</p>
            )}
            <p className="nota-documentos-efarm">Vista previa y PDF en carta; Imprimir en ticket de 80 mm. Ninguna acción registra otra venta.</p>
          </div>
        ) : (
          <p className="estado-documento-rapido-efarm">
            La venta está guardada. Tu usuario necesita permiso de consulta para abrir sus documentos.
          </p>
        )}

        <div className="acciones-resultado-venta acciones-resultado-efarm">
          {puedeVer && (
            <button className="boton-secundario-ventas" type="button" onClick={() => alVerVenta(resultado.venta.id)}>
              <List size={16} aria-hidden="true" />
              Ver detalle
            </button>
          )}
          <button className="boton-primario-ventas" type="button" onClick={reiniciarVenta}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Nueva venta
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="pos-ventas">
      <div className="flujo-pos-ventas" aria-label="Progreso de la venta">
        <div className={pasoActual >= 1 ? 'paso-pos-activo' : 'paso-pos-ventas'}><span>1</span><strong>Cliente</strong></div>
        <div className={pasoActual >= 2 ? 'paso-pos-activo' : 'paso-pos-ventas'}><span>2</span><strong>Productos</strong></div>
        <div className={pasoActual >= 3 ? 'paso-pos-activo' : 'paso-pos-ventas'}><span>3</span><strong>Cobro</strong></div>
      </div>
      <div className="acciones-superiores-pos-ventas">
        <button
          className="boton-secundario-ventas boton-limpiar-venta-ventas"
          type="button"
          onClick={solicitarReinicio}
          disabled={cargando || confirmando}
        >
          <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
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

      {pasoActual === 1 ? (
      <section className="tarjeta-pos-ventas comprador-ventas" aria-labelledby="comprador-venta">
          <div className="titulo-paso-ventas">
            <h2 id="comprador-venta">Cliente</h2>
          </div>
        <div className="buscador-cliente-ventas">
          {clienteSeleccionado && (
            <div className="cliente-seleccionado-ventas">
              <div>
                <span>Cliente registrado seleccionado</span>
                <strong>{nombreCliente(clienteSeleccionado)}</strong>
                <small>NIT {clienteSeleccionado.nit}</small>
              </div>
              <button
                className="boton-quitar-cliente-ventas"
                type="button"
                onClick={quitarClienteSeleccionado}
                disabled={reintentoPendiente}
                aria-label="Quitar cliente seleccionado"
                title="Quitar cliente seleccionado"
              >
                <Trash2 size={17} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="clientes-lista-ventas">
              <div className="clientes-lista-cabecera-ventas">
                <label htmlFor="buscar-cliente-venta">Clientes registrados</label>
                <input
                  id="buscar-cliente-venta"
                  value={busquedaCliente}
                  onChange={(evento) => setBusquedaCliente(evento.target.value)}
                  maxLength={150}
                  placeholder="Filtrar por nombre o NIT"
                  disabled={reintentoPendiente}
                />
              </div>
              <div className="clientes-lista-opciones-ventas" role="listbox" aria-label="Clientes registrados">
                {clientesVisibles.length ? clientesVisibles.map((cliente) => (
                  <button
                    key={cliente.id}
                    className={`cliente-opcion-ventas${cliente.id === formulario.cliente_id ? ' cliente-opcion-seleccionada-ventas' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={cliente.id === formulario.cliente_id}
                    onClick={() => seleccionarCliente(cliente.id)}
                    disabled={reintentoPendiente}
                  >
                    <span className="cliente-opcion-avatar-ventas" aria-hidden="true">
                      {nombreCliente(cliente).slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{nombreCliente(cliente)}</strong>
                      <small>NIT {cliente.nit || 'No registrado'}</small>
                    </span>
                  </button>
                )) : (
                  <p className="clientes-lista-vacia-ventas">No hay clientes que coincidan con la búsqueda.</p>
                )}
              </div>
              <div className="card-crear-cliente-ventas">
                <div>
                  <strong>¿No encuentras un cliente?</strong>
                  <span>Regístralo ahora y quedará seleccionado para esta venta.</span>
                </div>
                <button type="button" className="boton-crear-cliente-ventas" onClick={abrirNuevoCliente}>
                  <UserPlus size={15} strokeWidth={1.9} aria-hidden="true" />
                  Agregar cliente
                </button>
              </div>
          </div>
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
                <FileText size={15} strokeWidth={1.9} aria-hidden="true" />
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
        <div className="acciones-paso-ventas">
          <button className="boton-primario-ventas boton-avanzar-ventas" type="button" onClick={continuarCliente}>
            Continuar a productos
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </section>
      ) : (
        <section className="tarjeta-pos-ventas resumen-paso-ventas" aria-label="Cliente confirmado">
          <CheckCircle2 className="check-paso-completado-ventas" size={22} strokeWidth={2.2} aria-label="Paso completado" />
          <div>
            <span>PASO 1 COMPLETADO</span>
            <strong>{clienteSeleccionado ? nombreCliente(clienteSeleccionado) : formulario.comprador_nombre}</strong>
            <small>NIT {formulario.comprador_nit}</small>
          </div>
          <button className="boton-secundario-ventas boton-cambiar-cliente-ventas" type="button" onClick={() => setPasoActual(1)}>
            <RefreshCw size={15} strokeWidth={1.9} aria-hidden="true" />
            Cambiar cliente
          </button>
        </section>
      )}

      {pasoActual === 2 && <div className="rejilla-captura-ventas">
        <section className="tarjeta-pos-ventas producto-ventas" aria-labelledby="producto-venta">
          <div className="titulo-paso-ventas">
            <h2 id="producto-venta"><PackageSearch size={19} aria-hidden="true" /> Seleccionar producto</h2>
            <div className="filtro-rango-precio-ventas">
              <div className="encabezado-rango-precio-ventas">
                <span><SlidersHorizontal size={12} aria-hidden="true" /> Precio</span>
                <strong>{formatoMoneda.format(precioMinimoSlider)} - {formatoMoneda.format(precioMaximoSlider)}</strong>
              </div>
              <div className="controles-rango-precio-ventas">
                <input type="range" min={rangoPrecios.minimo} max={rangoPrecios.maximo} step="0.01" value={precioMinimoSlider} onChange={(evento) => setPrecioMinimo(String(Math.min(Number(evento.target.value), precioMaximoSlider)))} aria-label="Precio mínimo" disabled={reintentoPendiente} />
                <input type="range" min={rangoPrecios.minimo} max={rangoPrecios.maximo} step="0.01" value={precioMaximoSlider} onChange={(evento) => setPrecioMaximo(String(Math.max(Number(evento.target.value), precioMinimoSlider)))} aria-label="Precio máximo" disabled={reintentoPendiente} />
              </div>
            </div>
          </div>
          <div className="campo-ventas campo-filtro-variantes-ventas">
            <label htmlFor="buscar-producto-venta">
              <Search size={12} strokeWidth={2.2} aria-hidden="true" />
              Buscar variante
            </label>
            <input
              id="buscar-producto-venta"
              ref={buscadorProductoRef}
              value={busquedaProducto}
              onChange={(evento) => setBusquedaProducto(evento.target.value)}
              maxLength={150}
              placeholder="SKU, color, longitud o clasificación"
              aria-describedby="ayuda-busqueda-variante"
              disabled={reintentoPendiente}
            />
            <small id="ayuda-busqueda-variante" className="ayuda-filtro-variantes-ventas" aria-live="polite">
              {busquedaProducto.trim()
                ? `${variantesVisibles.length} variante${variantesVisibles.length === 1 ? '' : 's'} encontrada${variantesVisibles.length === 1 ? '' : 's'}`
                : `${variantesVisibles.length} variantes disponibles`}
            </small>
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
                {variantesVisibles.length === 0 ? (
                  <option value="" disabled>No hay variantes con ese filtro</option>
                ) : variantesVisibles.map((variante) => (
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

          <div className={`vista-previa-venta${seleccionSinStock ? ' vista-previa-sin-stock' : ''}${!varianteSeleccionada ? ' vista-previa-vacia' : ''}`}>
            {varianteSeleccionada ? (
              <button className="boton-ver-detalle-ventas" type="button" onClick={() => setDetalleProductoAbierto(true)}>
                <Info size={17} aria-hidden="true" />
                <span>Ver detalle</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : <p className="texto-detalle-vacio-ventas">Selecciona una variante para consultar su detalle.</p>}
            {seleccionSinStock && (
              <p role="alert">Stock insuficiente para el consumo total de esta variante.</p>
            )}
          </div>
        </section>

        <section
          className="tarjeta-pos-ventas calculadora-ventas"
          aria-labelledby="cantidad-venta"
          onKeyDown={manejarTecladoCalculadora}
        >
          <div className="titulo-paso-ventas">
            <h2 id="cantidad-venta"><Scale size={19} aria-hidden="true" /> Cantidad</h2>
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
          <details className="teclado-desplegable-ventas">
            <summary>Teclado numérico</summary>
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
          </details>
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
            Agregar producto
          </button>
        </section>
        <div className="acciones-paso-ventas acciones-paso-productos-ventas">
          <button className="boton-primario-ventas boton-avanzar-ventas" type="button" onClick={continuarProductos}>
            Continuar al cobro
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>}

      {pasoActual >= 2 && <section className="tarjeta-pos-ventas carrito-ventas" aria-labelledby="carrito-venta">
        <div className="encabezado-carrito-ventas">
          <div className="titulo-paso-ventas">
            <div>
            <h2 id="carrito-venta">Productos agregados</h2>
              <p>{lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'} agregadas</p>
            </div>
          </div>
          <div className="total-carrito-ventas">
            <span>Total previsto</span>
            <strong>{formatoMoneda.format(totalPrevisto)}</strong>
          </div>
          {detalleProductoAbierto && varianteSeleccionada && (
            <div className="fondo-dialogo-ventas" role="presentation" onMouseDown={(evento) => evento.target === evento.currentTarget && setDetalleProductoAbierto(false)}>
              <section className="dialogo-detalle-ventas" role="dialog" aria-modal="true" aria-labelledby="titulo-detalle-venta">
                <header className="encabezado-detalle-ventas">
                  <div><span>Información del producto</span><h3 id="titulo-detalle-venta">Detalle de variante</h3></div>
                  <button className="boton-cerrar-detalle-ventas" type="button" onClick={() => setDetalleProductoAbierto(false)} aria-label="Cerrar detalle"><X size={18} /></button>
                </header>
                <div className="rejilla-detalle-ventas">
                  <div><Tag /><span>SKU</span><strong>{varianteSeleccionada.codigo_sku}</strong></div>
                  <div><Boxes /><span>Producto</span><strong>{varianteSeleccionada.color}</strong></div>
                  <div><Ruler /><span>Longitud</span><strong>{varianteSeleccionada.longitud_cm} cm</strong></div>
                  <div><Layers3 /><span>Clasificación</span><strong>{varianteSeleccionada.clasificacion}</strong></div>
                  <div><PackageSearch /><span>Presentación</span><strong>{precioSeleccionado?.presentacion ?? '—'}</strong></div>
                  <div><CircleDollarSign /><span>Precio</span><strong>{precioSeleccionado ? formatoMoneda.format(Number(precioSeleccionado.precio)) : '—'}</strong></div>
                  <div><CheckCircle2 /><span>Estado</span><strong>Activa</strong></div>
                  <div><Boxes /><span>Disponible</span><strong>{stockSeleccionado} manojos</strong></div>
                  <div><Info /><span>Esta línea requiere</span><strong>{manojosSeleccionados} manojos</strong></div>
                  <div><PackageSearch /><span>En carrito</span><strong>{consumoCarritoVariante} manojos</strong></div>
                  <div><Boxes /><span>Después de venta</span><strong>{stockRestantePrevisto} manojos</strong></div>
                  <div><CircleDollarSign /><span>Subtotal</span><strong>{formatoMoneda.format(precioSeleccionado && cantidadValida ? Number(precioSeleccionado.precio) * cantidadNumero : 0)}</strong></div>
                </div>
                {(seleccionSinStock || stockRestantePrevisto === 0 || (!seleccionSinStock && stockRestantePrevisto > 0 && stockRestantePrevisto <= stockMinimoSeleccionado)) && (
                  <div className="avisos-detalle-ventas">
                    {seleccionSinStock && <p role="alert">Stock insuficiente para el consumo total de esta variante.</p>}
                    {!seleccionSinStock && stockRestantePrevisto === 0 && <p>Quedará sin stock.</p>}
                    {!seleccionSinStock && stockRestantePrevisto > 0 && stockRestantePrevisto <= stockMinimoSeleccionado && <p>Quedará en stock bajo.</p>}
                  </div>
                )}
              </section>
            </div>
          )}
          {pasoActual === 3 && (
            <CheckCircle2 className="check-paso-completado-ventas" size={22} strokeWidth={2.2} aria-label="Paso completado" />
          )}
          {pasoActual === 3 && (
            <button className="boton-secundario-ventas boton-regresar-productos-ventas" type="button" onClick={() => setPasoActual(2)}>
              <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
              Volver a productos
            </button>
          )}
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
                          aria-label={`Eliminar ${linea.codigo_sku} ${linea.presentacion_nombre}`}
                          title="Eliminar producto"
                        >
                          <Trash2 aria-hidden="true" size={17} strokeWidth={2.2} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pasoActual === 3 && <div className="cierre-pos-ventas">
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
                  <strong>{metodoPago === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</strong>
                </div>
                <div className="total-pago-ventas">
                  <span id="pago-venta">Total</span>
                  <strong>{formatoMoneda.format(totalPrevisto)}</strong>
                </div>
              </div>
              <div className="selector-metodo-pago-ventas" role="group" aria-label="Método de pago">
                <button className={metodoPago === 'efectivo' ? 'activo' : ''} type="button" onClick={() => { setMetodoPago('efectivo'); setStripeClientSecret(''); setStripePaymentIntentId(''); setStripeMontoPreparado(null) }} disabled={reintentoPendiente}>
                  <Banknote aria-hidden="true" size={16} strokeWidth={2.2} />
                  <span>Efectivo</span>
                </button>
                <button className={metodoPago === 'tarjeta' ? 'activo' : ''} type="button" onClick={() => { setMetodoPago('tarjeta'); setStripeClientSecret(''); setStripePaymentIntentId(''); setStripeMontoPreparado(null) }} disabled={reintentoPendiente}>
                  <CreditCard aria-hidden="true" size={16} strokeWidth={2.2} />
                  <span>Tarjeta</span>
                </button>
              </div>
              {metodoPago === 'efectivo' ? <>
                <label htmlFor="monto-recibido-venta">Pago recibido *</label>
                <div className="control-monto-ventas">
                  <span aria-hidden="true">Q</span>
                  <input
                    id="monto-recibido-venta"
                    ref={montoRecibidoRef}
                    type="text"
                    inputMode="decimal"
                    value={montoRecibido}
                    onChange={(evento) => actualizarMontoRecibido(evento.target.value)}
                    onBlur={() => {
                      if (montoRecibidoValido) setMontoRecibido(montoRecibidoNumero.toFixed(2))
                    }}
                    placeholder="0.00"
                    disabled={reintentoPendiente}
                    aria-describedby="resultado-pago-venta"
                  />
                  <button className="boton-secundario-ventas" type="button" onClick={() => { setMontoRecibido(totalPrevisto.toFixed(2)); setError('') }} disabled={lineas.length === 0 || reintentoPendiente}>Exacto</button>
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
                <div id="resultado-pago-venta" className={`resultado-pago-ventas${montoRecibidoValido && !pagoSuficiente ? ' resultado-pago-insuficiente-ventas' : ''}`} aria-live="polite">
                   {!montoRecibidoValido ? <><span>Pago recibido</span><strong>Ingresa un monto válido</strong></> : pagoSuficiente ? <><span>Cambio</span><strong>{formatoMoneda.format(cambioPrevisto)}</strong></> : <><span>Saldo a cuenta</span><strong>{formatoMoneda.format(montoFaltante)}</strong></>}
                </div>
              </> : (
                stripeClientSecret && stripePromise ? (
                  <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret, locale: 'es' }}>
                    <FormularioPagoStripe alConfirmar={setStripePaymentIntentId} deshabilitado={reintentoPendiente} />
                  </Elements>
                ) : (
                  <div className="preparar-pago-stripe-ventas">
                    <p>El pago se procesará de forma segura en USD usando Stripe.</p>
                    <button className="boton-pago-stripe-ventas" type="button" onClick={prepararPagoConTarjeta} disabled={preparandoPagoStripe || reintentoPendiente || lineas.length === 0}>
                      <CreditCard aria-hidden="true" size={16} strokeWidth={2.2} />
                      <span>{preparandoPagoStripe ? 'Preparando pago...' : 'Continuar con tarjeta'}</span>
                    </button>
                  </div>
                )
              )}
            </section>
            <div className="acciones-emision-ventas">
              <button
                className="boton-emitir-ventas"
                type="button"
                onClick={() => confirmarVentaYEmitir(DOCUMENTO_RECIBO)}
                disabled={emisionDeshabilitada}
              >
                {confirmando && documentoConfirmando === DOCUMENTO_RECIBO
                  ? 'Confirmando venta...'
                  : reintentoPendiente
                    ? 'Reintentar recibo'
                    : 'Emitir recibo'}
              </button>
              <button
                className="boton-emitir-ventas boton-emitir-factura-ventas"
                type="button"
                onClick={() => confirmarVentaYEmitir(DOCUMENTO_FACTURA)}
                disabled={emisionDeshabilitada}
              >
                {confirmando && documentoConfirmando === DOCUMENTO_FACTURA
                  ? 'Confirmando venta...'
                  : reintentoPendiente
                    ? 'Reintentar factura'
                    : 'Emitir factura'}
              </button>
            </div>
          </div>
        </div>}
      </section>}
      <ClienteDialog
        key={versionClienteDialogo}
        abierto={clienteDialogoAbierto}
        cliente={null}
        alCerrar={() => setClienteDialogoAbierto(false)}
        alGuardar={manejarClienteCreado}
        alRefrescarAutorizacion={alRefrescarAutorizacion}
      />
    </div>
  )
}

export default VentaPos
