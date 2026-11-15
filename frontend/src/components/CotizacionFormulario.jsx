import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, PackageSearch, Plus, RefreshCw, Save, Search, SlidersHorizontal, Trash2, UserPlus, X } from 'lucide-react'
import { listarClientes } from '../services/clientes'
import ClienteDialog from './ClienteDialog'
import {
  actualizarCotizacion,
  crearCotizacion,
  obtenerCotizacion,
} from '../services/cotizaciones'
import { listarVariantes } from '../services/productos'
import { formatearManojosPorUnidad } from '../utils/formatoUnidades'

const FORMULARIO_INICIAL = {
  tipo_comprador: 'registrado',
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
const MENSAJE_FORMATO_NIT = 'El NIT debe tener entre 7 y 9 dígitos.'

const nombreCliente = (cliente) =>
  cliente?.nombre_completo ?? cliente?.razon_social ?? 'Cliente sin nombre'

const normalizarCantidad = (valor) => {
  const cantidad = Number(valor)
  return Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= 1000000
    ? cantidad
    : null
}

function SelectorCotizacion({ id, label, value, placeholder, options, onChange, disabled }) {
  const [abierto, setAbierto] = useState(false)
  const opcionSeleccionada = options.find(([opcion]) => opcion === value)

  return (
    <div className="selector-cotizacion">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        className="boton-selector-cotizacion"
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 0)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        disabled={disabled}
      >
        <span>{opcionSeleccionada?.[1] ?? placeholder}</span>
        <ChevronDown size={16} strokeWidth={2.1} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="lista-selector-cotizacion" role="listbox" aria-label={label}>
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onMouseDown={(evento) => evento.preventDefault()}
            onClick={() => {
              onChange('')
              setAbierto(false)
            }}
          >
            {placeholder}
          </button>
          {options.map(([opcion, texto]) => (
            <button
              key={opcion}
              type="button"
              role="option"
              aria-selected={opcion === value}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => {
                onChange(opcion)
                setAbierto(false)
              }}
            >
              {texto}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CotizacionFormulario({ cotizacionId, alCancelar, alGuardado, alRefrescarAutorizacion }) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [clientes, setClientes] = useState([])
  const [variantes, setVariantes] = useState([])
  const [lineas, setLineas] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const [presentacionId, setPresentacionId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precioMinimo, setPrecioMinimo] = useState('')
  const [precioMaximo, setPrecioMaximo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [avisoLinea, setAvisoLinea] = useState('')
  const [numeroActual, setNumeroActual] = useState('')
  const [serieActual, setSerieActual] = useState('')
  const [clienteDialogoAbierto, setClienteDialogoAbierto] = useState(false)
  const [pasoActual, setPasoActual] = useState(1)
  const guardandoRef = useRef(false)

  useEffect(() => {
    let activo = true

    const cargarDatos = async () => {
      setCargando(true)
      setError('')

      try {
        const [resultadoClientes, resultadoVariantes, detalle] =
          await Promise.all([
            listarClientes({ pagina: 1, limite: 100, activo: true }),
            listarVariantes({ pagina: 1, limite: 100, activo: true }),
            cotizacionId ? obtenerCotizacion(cotizacionId) : null,
          ])

        if (!activo) return

        const clientesDisponibles = resultadoClientes.clientes

        if (detalle) {
          const cotizacion = detalle.cotizacion
          let opcionesCliente = clientesDisponibles

          if (
            cotizacion.cliente_id &&
            !clientesDisponibles.some(
              (cliente) => cliente.id === cotizacion.cliente_id,
            )
          ) {
            opcionesCliente = [
              {
                id: cotizacion.cliente_id,
                nombre_completo: cotizacion.comprador_nombre,
                nit: cotizacion.comprador_nit,
                direccion: cotizacion.comprador_direccion,
                activo: false,
              },
              ...clientesDisponibles,
            ]
          }

          setClientes(opcionesCliente)
          setFormulario({
            tipo_comprador: cotizacion.cliente_id
              ? 'registrado'
              : 'ocasional',
            cliente_id: cotizacion.cliente_id ?? '',
            comprador_nombre: cotizacion.comprador_nombre ?? '',
            comprador_nit: cotizacion.comprador_nit ?? '',
            comprador_direccion: cotizacion.comprador_direccion ?? '',
            observaciones: cotizacion.observaciones ?? '',
          })
          setLineas(
            detalle.detalles.map((linea) => ({
              ...linea,
              cantidad_presentaciones: Number(linea.cantidad_presentaciones),
              precio_unitario: Number(linea.precio_unitario),
              subtotal: Number(linea.subtotal),
            })),
          )
          setNumeroActual(cotizacion.numero ?? '')
          setSerieActual(cotizacion.serie_usuario_snapshot ?? '')
        } else {
          setClientes(clientesDisponibles)
        }

        setVariantes(resultadoVariantes.variantes)
      } catch (errorCarga) {
        if (!activo) return
        setError(
          errorCarga?.message ||
            'No fue posible preparar el formulario de cotización.',
        )
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargarDatos()
    return () => {
      activo = false
    }
  }, [cotizacionId])

  const varianteSeleccionada = useMemo(
    () => variantes.find((variante) => variante.id === varianteId) ?? null,
    [varianteId, variantes],
  )
  const preciosDisponibles = varianteSeleccionada?.precios ?? []
  const rangoPrecios = useMemo(() => {
    const precios = variantes.flatMap((variante) => (variante.precios ?? []).map((precio) => Number(precio.precio)))
    return {
      minimo: precios.length ? Math.min(...precios) : 0,
      maximo: precios.length ? Math.max(...precios) : 0,
    }
  }, [variantes])
  const precioMinimoNumero = precioMinimo === '' ? rangoPrecios.minimo : Number(precioMinimo)
  const precioMaximoNumero = precioMaximo === '' ? rangoPrecios.maximo : Number(precioMaximo)
  const variantesVisibles = useMemo(() => {
    const termino = busquedaProducto.trim().toLocaleLowerCase()
    return variantes.filter((variante) => {
      const coincideTexto = !termino || [variante.codigo_sku, variante.color, variante.clasificacion, variante.longitud_cm]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase().includes(termino))
      const coincidePrecio = (variante.precios ?? []).some((precio) => Number(precio.precio) >= precioMinimoNumero && Number(precio.precio) <= precioMaximoNumero)
      return coincideTexto && coincidePrecio
    })
  }, [busquedaProducto, precioMaximoNumero, precioMinimoNumero, variantes])
  const precioSeleccionado =
    preciosDisponibles.find(
      (precio) => precio.presentacion_id === presentacionId,
    ) ?? null
  const clienteSeleccionado =
    clientes.find((cliente) => cliente.id === formulario.cliente_id) ?? null
  const clientesVisibles = useMemo(() => {
    const termino = busquedaCliente.trim().toLocaleLowerCase()
    if (!termino) return clientes

    return clientes.filter((cliente) =>
      [nombreCliente(cliente), cliente.nit, cliente.razon_social]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase().includes(termino)),
    )
  }, [busquedaCliente, clientes])
  const totalPrevisto = lineas.reduce(
    (total, linea) =>
      total + Number(linea.precio_unitario) * linea.cantidad_presentaciones,
    0,
  )
  const nitComprador = formulario.comprador_nit.trim()
  const nitCompradorInvalido =
    formulario.tipo_comprador === 'ocasional' &&
    nitComprador.length > 0 &&
    !/^\d{7,9}$/.test(nitComprador)

  const actualizarFormulario = (evento) => {
    const { name, value } = evento.target
    setFormulario((actual) => ({ ...actual, [name]: value }))
    setError('')
  }

  const cambiarTipoComprador = (tipo) => {
    setFormulario((actual) => ({
      ...actual,
      tipo_comprador: tipo,
      cliente_id: tipo === 'registrado' ? actual.cliente_id : '',
      comprador_nombre: tipo === 'ocasional' ? actual.comprador_nombre : '',
      comprador_nit: tipo === 'ocasional' ? actual.comprador_nit : '',
      comprador_direccion:
        tipo === 'ocasional' ? actual.comprador_direccion : '',
    }))
    setError('')
  }

  const seleccionarCliente = (clienteId) => {
    const cliente = clientes.find((actual) => actual.id === clienteId)
    if (!cliente) return

    setFormulario((actual) => ({
      ...actual,
      tipo_comprador: 'registrado',
      cliente_id: cliente.id,
      comprador_nombre: nombreCliente(cliente),
      comprador_nit: cliente.nit ?? '',
      comprador_direccion: cliente.direccion ?? '',
    }))
    setError('')
  }

  const quitarClienteSeleccionado = () => {
    setFormulario((actual) => ({
      ...actual,
      cliente_id: '',
      comprador_nombre: '',
      comprador_nit: '',
      comprador_direccion: '',
    }))
    setError('')
  }

  const manejarClienteCreado = (cliente) => {
    setClientes((actuales) => [cliente, ...actuales])
    seleccionarCliente(cliente.id)
    setClienteDialogoAbierto(false)
  }

  const continuarCliente = () => {
    if (formulario.tipo_comprador === 'registrado' && !formulario.cliente_id) {
      setError('Selecciona un cliente registrado para continuar.')
      return
    }
    if (formulario.tipo_comprador === 'ocasional' && !formulario.comprador_nombre.trim()) {
      setError('Completa el nombre del comprador ocasional.')
      return
    }
    if (formulario.tipo_comprador === 'ocasional' && !/^\d{7,9}$/.test(nitComprador)) {
      setError(MENSAJE_FORMATO_NIT)
      return
    }
    setError('')
    setPasoActual(2)
  }

  const continuarResumen = () => {
    if (lineas.length === 0) {
      setError('Agrega al menos una línea de producto para continuar.')
      return
    }
    if (lineas.some((linea) => normalizarCantidad(linea.cantidad_presentaciones) === null)) {
      setError('Todas las cantidades deben ser números enteros mayores que cero.')
      return
    }
    setError('')
    setPasoActual(3)
  }

  const agregarLinea = () => {
    const cantidadValida = normalizarCantidad(cantidad)

    if (!varianteSeleccionada || !precioSeleccionado || !cantidadValida) {
      setError('Selecciona una variante, una presentación y una cantidad válida.')
      return
    }

    const claveCoincidente = (linea) =>
      linea.variante_id === varianteSeleccionada.id &&
      linea.presentacion_id === precioSeleccionado.presentacion_id

    const nuevaLinea = {
      variante_id: varianteSeleccionada.id,
      presentacion_id: precioSeleccionado.presentacion_id,
      precio_producto_id: precioSeleccionado.id,
      producto_codigo: 'SNAPDRAGON',
      producto_nombre: 'Snapdragon',
      codigo_sku: varianteSeleccionada.codigo_sku,
      color: varianteSeleccionada.color,
      longitud_cm: varianteSeleccionada.longitud_cm,
      clasificacion: varianteSeleccionada.clasificacion,
      presentacion_codigo: precioSeleccionado.codigo_presentacion,
      presentacion_nombre: precioSeleccionado.presentacion,
      cantidad_manojos_presentacion: precioSeleccionado.cantidad_manojos,
      cantidad_presentaciones: cantidadValida,
      precio_unitario: Number(precioSeleccionado.precio),
    }

    setLineas((actuales) => {
      if (actuales.some(claveCoincidente)) {
        return actuales.map((linea) =>
          claveCoincidente(linea)
            ? { ...linea, cantidad_presentaciones: cantidadValida }
            : linea,
        )
      }
      return [...actuales, nuevaLinea]
    })
    setAvisoLinea(
      lineas.some(claveCoincidente)
        ? 'La cantidad de la línea existente fue actualizada.'
        : 'Producto agregado a la cotización.',
    )
    setError('')
    setCantidad('1')
  }

  const actualizarCantidadLinea = (indice, valor) => {
    setLineas((actuales) =>
      actuales.map((linea, posicion) =>
        posicion === indice
          ? { ...linea, cantidad_presentaciones: valor }
          : linea,
      ),
    )
    setAvisoLinea('')
  }

  const eliminarLinea = (indice) => {
    setLineas((actuales) =>
      actuales.filter((_linea, posicion) => posicion !== indice),
    )
    setAvisoLinea('')
  }

  const guardar = async (evento) => {
    evento.preventDefault()
    if (guardandoRef.current) return

    if (
      formulario.tipo_comprador === 'registrado' &&
      !formulario.cliente_id
    ) {
      setError('Selecciona el cliente registrado de la cotización.')
      return
    }
    if (formulario.tipo_comprador === 'ocasional' && !formulario.comprador_nombre.trim()) {
      setError('Completa el nombre del comprador ocasional.')
      return
    }
    if (formulario.tipo_comprador === 'ocasional' && !/^\d{7,9}$/.test(nitComprador)) {
      setError(MENSAJE_FORMATO_NIT)
      return
    }
    if (lineas.length === 0) {
      setError('Agrega al menos una línea a la cotización.')
      return
    }

    const detalles = lineas.map((linea) => ({
      variante_id: linea.variante_id,
      presentacion_id: linea.presentacion_id,
      cantidad_presentaciones: normalizarCantidad(
        linea.cantidad_presentaciones,
      ),
    }))

    if (detalles.some((detalle) => detalle.cantidad_presentaciones === null)) {
      setError('Todas las cantidades deben ser números enteros mayores que cero.')
      return
    }

    const datos = {
      cliente_id:
        formulario.tipo_comprador === 'registrado'
          ? formulario.cliente_id
          : null,
      comprador_nombre:
        formulario.tipo_comprador === 'ocasional'
          ? formulario.comprador_nombre
          : null,
      comprador_nit:
        formulario.tipo_comprador === 'ocasional'
          ? formulario.comprador_nit
          : null,
      comprador_direccion:
        formulario.tipo_comprador === 'ocasional'
          ? formulario.comprador_direccion
          : null,
      observaciones: formulario.observaciones,
      detalles,
    }

    guardandoRef.current = true
    setGuardando(true)
    setError('')

    try {
      const resultado = cotizacionId
        ? await actualizarCotizacion(cotizacionId, datos)
        : await crearCotizacion(datos)
      await alGuardado(resultado.cotizacion.id)
    } catch (errorGuardado) {
      setError(
        errorGuardado?.message || 'No fue posible guardar la cotización.',
      )
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <section className="estado-cotizaciones" aria-live="polite">
        Preparando cotización...
      </section>
    )
  }

  return (
    <>
    <form className="formulario-cotizacion" onSubmit={guardar}>
      <header className="encabezado-cotizaciones encabezado-formulario-cotizacion">
        <div>
          <p className="etiqueta-seccion-cotizaciones">
            {cotizacionId ? 'Edición de borrador' : 'Nueva cotización'}
          </p>
          <h1>{cotizacionId ? `Editar ${numeroActual}` : 'Crear cotización'}</h1>
          <p>
            Revisa los productos y cantidades. Los cambios se guardarán al confirmar la cotización.
          </p>
        </div>
        <button
          className="boton-secundario-cotizaciones"
          type="button"
          onClick={alCancelar}
          disabled={guardando}
        >
          <ArrowLeft size={15} strokeWidth={2.1} aria-hidden="true" />
          Volver
        </button>
      </header>

      {error && (
        <p className="mensaje-cotizaciones mensaje-error-cotizaciones" role="alert">
          {error}
        </p>
      )}

      <nav className="pasos-formulario-cotizacion" aria-label="Pasos de la cotización">
        {[['Cliente', 1], ['Productos', 2], ['Resumen', 3]].map(([etiqueta, paso]) => (
          <span key={etiqueta} className={paso <= pasoActual ? 'paso-cotizacion-activo' : ''}>
            <strong>{paso}</strong>
            {etiqueta}
          </span>
        ))}
      </nav>

      {pasoActual === 1 ? (
      <section className="seccion-formulario-cotizacion" aria-labelledby="comprador-cotizacion">
        <div className="titulo-seccion-cotizacion">
          <span>1</span>
          <div>
            <h2 id="comprador-cotizacion">Comprador</h2>
            <p>Selecciona un cliente registrado o captura un comprador ocasional.</p>
          </div>
        </div>

        <div className="selector-tipo-comprador" role="radiogroup" aria-label="Tipo de comprador">
          <label>
            <input
              type="radio"
              name="tipo_comprador"
              checked={formulario.tipo_comprador === 'registrado'}
              onChange={() => cambiarTipoComprador('registrado')}
            />
            Cliente registrado
          </label>
          <label>
            <input
              type="radio"
              name="tipo_comprador"
              checked={formulario.tipo_comprador === 'ocasional'}
              onChange={() => cambiarTipoComprador('ocasional')}
            />
            Comprador ocasional
          </label>
        </div>

        {formulario.tipo_comprador === 'registrado' ? (
          <div className="contenido-comprador-cotizacion comprador-registrado-cotizacion">
            <div className="clientes-lista-cotizacion">
              {clienteSeleccionado && (
                <div className="cliente-seleccionado-cotizacion">
                  <div>
                    <span>Cliente registrado seleccionado</span>
                    <strong>{nombreCliente(clienteSeleccionado)}</strong>
                    <small>NIT {clienteSeleccionado.nit || 'No registrado'}</small>
                  </div>
                  <button
                    className="boton-quitar-cliente-cotizacion"
                    type="button"
                    onClick={quitarClienteSeleccionado}
                    aria-label="Quitar cliente seleccionado"
                    title="Quitar cliente seleccionado"
                  >
                    <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                </div>
              )}
              <div className="cabecera-lista-clientes-cotizacion">
                <label htmlFor="busqueda-cliente-cotizacion">Clientes registrados</label>
                <input
                  id="busqueda-cliente-cotizacion"
                  value={busquedaCliente}
                  onChange={(evento) => setBusquedaCliente(evento.target.value)}
                  maxLength={150}
                  placeholder="Filtrar por nombre o NIT"
                />
              </div>
              <div className="opciones-clientes-cotizacion" role="listbox" aria-label="Clientes registrados">
                {clientesVisibles.length ? clientesVisibles.map((cliente) => (
                  <button
                    key={cliente.id}
                    className={`opcion-cliente-cotizacion${cliente.id === formulario.cliente_id ? ' opcion-cliente-seleccionada-cotizacion' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={cliente.id === formulario.cliente_id}
                    onClick={() => seleccionarCliente(cliente.id)}
                  >
                    <span className="avatar-cliente-cotizacion" aria-hidden="true">
                      {nombreCliente(cliente).slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{nombreCliente(cliente)}</strong>
                      <small>NIT {cliente.nit || 'No registrado'}</small>
                    </span>
                  </button>
                )) : <p className="lista-clientes-vacia-cotizacion">No hay clientes que coincidan con la búsqueda.</p>}
              </div>
              <div className="card-crear-cliente-cotizacion">
                <div>
                  <strong>¿No encuentras un cliente?</strong>
                  <span>Regístralo ahora y quedará seleccionado para esta cotización.</span>
                </div>
                <button type="button" onClick={() => setClienteDialogoAbierto(true)}>
                  <UserPlus size={15} strokeWidth={1.9} aria-hidden="true" />
                  Agregar cliente
                </button>
              </div>
            </div>
            <div className="campos-cliente-cotizacion">
              <div className="campo-cotizacion">
                <label htmlFor="cliente-cotizacion">Nombre *</label>
                <input id="cliente-cotizacion" name="comprador_nombre" value={formulario.comprador_nombre} onChange={actualizarFormulario} disabled={Boolean(formulario.cliente_id)} required />
              </div>
              <div className="campo-cotizacion">
                <label htmlFor="nit-cliente-cotizacion">NIT *</label>
                <input id="nit-cliente-cotizacion" name="comprador_nit" value={formulario.comprador_nit} onChange={actualizarFormulario} disabled={Boolean(formulario.cliente_id)} required />
              </div>
              <div className="campo-cotizacion campo-ancho-cotizacion">
                <label htmlFor="direccion-cliente-cotizacion">Dirección</label>
                <input id="direccion-cliente-cotizacion" name="comprador_direccion" value={formulario.comprador_direccion} onChange={actualizarFormulario} disabled={Boolean(formulario.cliente_id)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="contenido-comprador-cotizacion">
            <div className="campo-cotizacion">
              <label htmlFor="nombre-comprador-cotizacion">Nombre *</label>
              <input
                id="nombre-comprador-cotizacion"
                name="comprador_nombre"
                value={formulario.comprador_nombre}
                onChange={actualizarFormulario}
                maxLength={200}
                required
              />
            </div>
            <div className="campo-cotizacion">
              <label htmlFor="nit-comprador-cotizacion">NIT *</label>
              <input
                id="nit-comprador-cotizacion"
                name="comprador_nit"
                value={formulario.comprador_nit}
                onChange={actualizarFormulario}
                maxLength={30}
                required
                inputMode="numeric"
                aria-invalid={nitCompradorInvalido}
                aria-describedby="ayuda-nit-comprador-cotizacion"
              />
              <small
                id="ayuda-nit-comprador-cotizacion"
                className={nitCompradorInvalido ? 'ayuda-nit-cotizacion-error' : undefined}
                role={nitCompradorInvalido ? 'alert' : undefined}
              >
                {nitCompradorInvalido ? MENSAJE_FORMATO_NIT : 'Debe contener entre 7 y 9 dígitos.'}
              </small>
            </div>
            <div className="campo-cotizacion campo-ancho-cotizacion">
              <label htmlFor="direccion-comprador-cotizacion">Dirección</label>
              <textarea
                id="direccion-comprador-cotizacion"
                name="comprador_direccion"
                value={formulario.comprador_direccion}
                onChange={actualizarFormulario}
                maxLength={500}
                rows="2"
              />
            </div>
          </div>
        )}
        <div className="acciones-comprador-cotizacion">
          <button
            className="boton-primario-cotizaciones"
            type="button"
            onClick={continuarCliente}
          >
            Continuar a productos
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </section>
      ) : (
      <>
        <section className="resumen-paso-cotizacion" aria-label="Cliente confirmado">
          <CheckCircle2 size={22} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <span>PASO 1 COMPLETADO</span>
            <strong>{clienteSeleccionado ? nombreCliente(clienteSeleccionado) : formulario.comprador_nombre}</strong>
            <small>NIT {formulario.comprador_nit}</small>
          </div>
          <button className="boton-secundario-cotizaciones" type="button" onClick={() => setPasoActual(1)}>
            <RefreshCw size={15} strokeWidth={1.9} aria-hidden="true" />
            Cambiar cliente
          </button>
        </section>

        {pasoActual === 2 ? (
        <>
      <section className="seccion-formulario-cotizacion" aria-labelledby="productos-cotizacion">
        <div className="titulo-seccion-cotizacion titulo-productos-cotizacion">
          <h2 id="productos-cotizacion"><PackageSearch size={19} aria-hidden="true" /> Seleccionar producto</h2>
          <div className="filtro-precio-cotizacion">
            <span><SlidersHorizontal size={12} aria-hidden="true" /> Precio</span>
            <strong>{formatoMoneda.format(precioMinimoNumero)} - {formatoMoneda.format(precioMaximoNumero)}</strong>
            <div>
              <input type="range" min={rangoPrecios.minimo} max={rangoPrecios.maximo || 1} step="0.01" value={precioMinimoNumero} onChange={(evento) => setPrecioMinimo(String(Math.min(Number(evento.target.value), precioMaximoNumero)))} aria-label="Precio mínimo" />
              <input type="range" min={rangoPrecios.minimo} max={rangoPrecios.maximo || 1} step="0.01" value={precioMaximoNumero} onChange={(evento) => setPrecioMaximo(String(Math.max(Number(evento.target.value), precioMinimoNumero)))} aria-label="Precio máximo" />
            </div>
          </div>
        </div>

        <div className="agregador-productos-cotizacion">
          <div className="campo-cotizacion campo-busqueda-producto-cotizacion">
            <label htmlFor="busqueda-producto-cotizacion"><Search size={12} strokeWidth={2.2} aria-hidden="true" /> Buscar variante</label>
            <input id="busqueda-producto-cotizacion" value={busquedaProducto} onChange={(evento) => setBusquedaProducto(evento.target.value)} maxLength={150} placeholder="SKU, color, longitud o clasificación" />
            <small>{busquedaProducto.trim() ? `${variantesVisibles.length} variantes encontradas` : `${variantesVisibles.length} variantes disponibles`}</small>
          </div>
          <div className="campo-cotizacion">
            <SelectorCotizacion
              id="variante-cotizacion"
              label="Variante *"
              value={varianteId}
              placeholder="Selecciona una variante"
              options={variantesVisibles.map((variante) => [
                variante.id,
                `${variante.codigo_sku} · ${variante.color} · ${variante.longitud_cm} cm`,
              ])}
              onChange={(valor) => {
                setVarianteId(valor)
                setPresentacionId('')
              }}
            />
          </div>
          <div className="campo-cotizacion">
            <SelectorCotizacion
              id="presentacion-cotizacion"
              label="Presentación *"
              value={presentacionId}
              placeholder="Selecciona una presentación"
              options={preciosDisponibles.map((precio) => [
                precio.presentacion_id,
                `${precio.presentacion} · ${formatoMoneda.format(Number(precio.precio))}`,
              ])}
              onChange={setPresentacionId}
              disabled={!varianteSeleccionada}
            />
          </div>
          <div className="campo-cotizacion cantidad-producto-cotizacion">
            <label htmlFor="cantidad-cotizacion">Cantidad</label>
            <input
              id="cantidad-cotizacion"
              type="number"
              min="1"
              max="1000000"
              step="1"
              value={cantidad}
              onChange={(evento) => setCantidad(evento.target.value)}
            />
            <button className="boton-primario-cotizaciones" type="button" onClick={agregarLinea}>
              <Plus size={16} strokeWidth={2.1} aria-hidden="true" />
              Agregar producto
            </button>
          </div>
          <div className="vista-previa-linea-cotizacion" aria-live="polite">
            <span>
              Precio actual
              <strong>
                {precioSeleccionado
                  ? formatoMoneda.format(Number(precioSeleccionado.precio))
                  : '—'}
              </strong>
            </span>
            <span>
              Equivalencia
              <strong>
                {precioSeleccionado
                  ? formatearManojosPorUnidad(
                      precioSeleccionado.cantidad_manojos,
                    )
                  : '—'}
              </strong>
            </span>
          </div>
        </div>

        {avisoLinea && (
          <p className="aviso-linea-cotizacion" role="status">
            {avisoLinea}
          </p>
        )}

        <div className="contenedor-tabla-cotizaciones tabla-lineas-cotizacion">
          {lineas.length === 0 ? (
            <p className="estado-cotizaciones">Aún no hay productos agregados.</p>
          ) : (
            <div className="desplazamiento-tabla-cotizaciones">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Presentación</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Manojos</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Subtotal</th>
                    <th scope="col"><span className="solo-lector">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea, indice) => {
                    const cantidadLinea = Number(linea.cantidad_presentaciones)
                    const subtotal = Number(linea.precio_unitario) * cantidadLinea
                    return (
                      <tr key={`${linea.variante_id}-${linea.presentacion_id}`}>
                        <td data-label="Producto">
                          <strong>{linea.codigo_sku}</strong>
                          <small>
                            {linea.color} · {linea.longitud_cm} cm · {linea.clasificacion}
                          </small>
                        </td>
                        <td data-label="Presentación">
                          {linea.presentacion_nombre}
                        </td>
                        <td data-label="Cantidad">
                          <input
                            className="cantidad-linea-cotizacion"
                            type="number"
                            min="1"
                            max="1000000"
                            step="1"
                            value={linea.cantidad_presentaciones}
                            aria-label={`Cantidad de ${linea.codigo_sku} en ${linea.presentacion_nombre}`}
                            onChange={(evento) =>
                              actualizarCantidadLinea(indice, evento.target.value)
                            }
                          />
                        </td>
                        <td data-label="Manojos">
                          {Number(linea.cantidad_manojos_presentacion) * cantidadLinea}
                        </td>
                        <td data-label="Precio">
                          {formatoMoneda.format(Number(linea.precio_unitario))}
                        </td>
                        <td data-label="Subtotal">
                          <strong>{formatoMoneda.format(subtotal)}</strong>
                        </td>
                        <td data-label="Acciones">
                          <button
                            className="boton-texto-peligro-cotizaciones"
                            type="button"
                            onClick={() => eliminarLinea(indice)}
                            aria-label={`Quitar ${linea.codigo_sku}`}
                            title="Quitar producto"
                          >
                            <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="acciones-paso-cotizacion">
        <button className="boton-primario-cotizaciones" type="button" onClick={continuarResumen}>
          Continuar al resumen
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
        </>
        ) : (
        <>
      <section className="seccion-formulario-cotizacion" aria-labelledby="resumen-cotizacion">
        <div className="titulo-seccion-cotizacion">
          <span>3</span>
          <div>
            <h2 id="resumen-cotizacion">Resumen</h2>
            <p>Revisa las líneas antes de guardar el borrador.</p>
          </div>
        </div>
        <div className="resumen-formulario-cotizacion">
          <div className="campo-cotizacion">
            <label htmlFor="observaciones-cotizacion">Observaciones</label>
            <textarea
              id="observaciones-cotizacion"
              name="observaciones"
              value={formulario.observaciones}
              onChange={actualizarFormulario}
              maxLength={1000}
              rows="4"
              placeholder="Información adicional para la cotización"
            />
          </div>
          <aside className="total-formulario-cotizacion">
            <span>Serie</span>
            <strong>{serieActual || 'Asignada al guardar'}</strong>
            <span>Número</span>
            <strong>{numeroActual || 'Asignado al guardar'}</strong>
            <span>Total previsto</span>
            <strong className="monto-total-cotizacion">
              {formatoMoneda.format(totalPrevisto)}
            </strong>
            <small>El total se actualizará con los productos y cantidades seleccionados.</small>
          </aside>
        </div>
      </section>

      <footer className="acciones-formulario-cotizacion">
        <button
          className="boton-secundario-cotizaciones"
          type="button"
          onClick={alCancelar}
          disabled={guardando}
        >
          <X size={15} strokeWidth={2.1} aria-hidden="true" />
          Cancelar
        </button>
        <button
          className="boton-primario-cotizaciones"
          type="submit"
          disabled={guardando}
        >
          <Save size={15} strokeWidth={2.1} aria-hidden="true" />
          {guardando
            ? 'Guardando...'
            : cotizacionId
              ? 'Guardar cambios'
              : 'Crear borrador'}
        </button>
      </footer>
        </>
        )}
      </>
      )}
    </form>
    {clienteDialogoAbierto && (
      <ClienteDialog
        key="nuevo-cliente-cotizacion"
        abierto
        cliente={null}
        alCerrar={() => setClienteDialogoAbierto(false)}
        alGuardar={manejarClienteCreado}
        alRefrescarAutorizacion={alRefrescarAutorizacion ?? (() => {})}
      />
    )}
    </>
  )
}

export default CotizacionFormulario
