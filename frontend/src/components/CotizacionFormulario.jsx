import { useEffect, useMemo, useRef, useState } from 'react'
import { listarClientes } from '../services/clientes'
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

const nombreCliente = (cliente) =>
  cliente?.nombre_completo ?? cliente?.razon_social ?? 'Cliente sin nombre'

const normalizarCantidad = (valor) => {
  const cantidad = Number(valor)
  return Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= 1000000
    ? cantidad
    : null
}

function CotizacionFormulario({ cotizacionId, alCancelar, alGuardado }) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [clientes, setClientes] = useState([])
  const [variantes, setVariantes] = useState([])
  const [lineas, setLineas] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const [presentacionId, setPresentacionId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [cargando, setCargando] = useState(true)
  const [consultandoClientes, setConsultandoClientes] = useState(false)
  const [consultandoProductos, setConsultandoProductos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [avisoLinea, setAvisoLinea] = useState('')
  const [numeroActual, setNumeroActual] = useState('')
  const [serieActual, setSerieActual] = useState('')
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
  const precioSeleccionado =
    preciosDisponibles.find(
      (precio) => precio.presentacion_id === presentacionId,
    ) ?? null
  const clienteSeleccionado =
    clientes.find((cliente) => cliente.id === formulario.cliente_id) ?? null
  const totalPrevisto = lineas.reduce(
    (total, linea) =>
      total + Number(linea.precio_unitario) * linea.cantidad_presentaciones,
    0,
  )

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

  const buscarClientes = async () => {
    if (consultandoClientes) return
    setConsultandoClientes(true)
    setError('')

    try {
      const resultado = await listarClientes({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda: busquedaCliente.trim(),
      })
      setClientes(resultado.clientes)
      setFormulario((actual) => ({ ...actual, cliente_id: '' }))
    } catch (errorConsulta) {
      setError(errorConsulta?.message || 'No fue posible buscar clientes.')
    } finally {
      setConsultandoClientes(false)
    }
  }

  const buscarProductos = async () => {
    if (consultandoProductos) return
    setConsultandoProductos(true)
    setError('')

    try {
      const resultado = await listarVariantes({
        pagina: 1,
        limite: 100,
        activo: true,
        busqueda: busquedaProducto.trim(),
      })
      setVariantes(resultado.variantes)
      setVarianteId('')
      setPresentacionId('')
    } catch (errorConsulta) {
      setError(errorConsulta?.message || 'No fue posible buscar productos.')
    } finally {
      setConsultandoProductos(false)
    }
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
    if (
      formulario.tipo_comprador === 'ocasional' &&
      (!formulario.comprador_nombre.trim() || !formulario.comprador_nit.trim())
    ) {
      setError('Completa el nombre y NIT del comprador ocasional.')
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
    <form className="formulario-cotizacion" onSubmit={guardar}>
      <header className="encabezado-cotizaciones encabezado-formulario-cotizacion">
        <div>
          <p className="etiqueta-seccion-cotizaciones">
            {cotizacionId ? 'Edición de borrador' : 'Nueva cotización'}
          </p>
          <h1>{cotizacionId ? `Editar ${numeroActual}` : 'Crear cotización'}</h1>
          <p>
            Los precios y el total definitivo se validan al guardar en la base
            de datos.
          </p>
        </div>
        <button
          className="boton-secundario-cotizaciones"
          type="button"
          onClick={alCancelar}
          disabled={guardando}
        >
          Volver
        </button>
      </header>

      {error && (
        <p className="mensaje-cotizaciones mensaje-error-cotizaciones" role="alert">
          {error}
        </p>
      )}

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
          <div className="contenido-comprador-cotizacion">
            <div className="campo-cotizacion campo-ancho-cotizacion">
              <label htmlFor="busqueda-cliente-cotizacion">Buscar cliente</label>
              <div className="control-con-boton-cotizacion">
                <input
                  id="busqueda-cliente-cotizacion"
                  value={busquedaCliente}
                  onChange={(evento) => setBusquedaCliente(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter') {
                      evento.preventDefault()
                      buscarClientes()
                    }
                  }}
                  maxLength={150}
                  placeholder="Nombre, razón social o NIT"
                />
                <button
                  className="boton-secundario-cotizaciones"
                  type="button"
                  onClick={buscarClientes}
                  disabled={consultandoClientes}
                >
                  {consultandoClientes ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>
            <div className="campo-cotizacion campo-ancho-cotizacion">
              <label htmlFor="cliente-cotizacion">Cliente *</label>
              <select
                id="cliente-cotizacion"
                name="cliente_id"
                value={formulario.cliente_id}
                onChange={actualizarFormulario}
                required
              >
                <option value="">Selecciona un cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {nombreCliente(cliente)} · NIT {cliente.nit}
                    {cliente.activo === false ? ' (inactivo)' : ''}
                  </option>
                ))}
              </select>
              {clienteSeleccionado && (
                <small>
                  {clienteSeleccionado.direccion || 'Dirección no disponible'}
                </small>
              )}
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
              />
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
      </section>

      <section className="seccion-formulario-cotizacion" aria-labelledby="productos-cotizacion">
        <div className="titulo-seccion-cotizacion">
          <span>2</span>
          <div>
            <h2 id="productos-cotizacion">Productos</h2>
            <p>Agrega variantes de Snapdragon con su presentación comercial.</p>
          </div>
        </div>

        <div className="agregador-productos-cotizacion">
          <div className="campo-cotizacion campo-busqueda-producto-cotizacion">
            <label htmlFor="busqueda-producto-cotizacion">Buscar variante</label>
            <div className="control-con-boton-cotizacion">
              <input
                id="busqueda-producto-cotizacion"
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
              />
              <button
                className="boton-secundario-cotizaciones"
                type="button"
                onClick={buscarProductos}
                disabled={consultandoProductos}
              >
                {consultandoProductos ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
          <div className="campo-cotizacion">
            <label htmlFor="variante-cotizacion">Variante</label>
            <select
              id="variante-cotizacion"
              value={varianteId}
              onChange={(evento) => {
                setVarianteId(evento.target.value)
                setPresentacionId('')
              }}
            >
              <option value="">Selecciona una variante</option>
              {variantes.map((variante) => (
                <option key={variante.id} value={variante.id}>
                  {variante.codigo_sku} · {variante.color} · {variante.longitud_cm} cm
                </option>
              ))}
            </select>
          </div>
          <div className="campo-cotizacion">
            <label htmlFor="presentacion-cotizacion">Presentación</label>
            <select
              id="presentacion-cotizacion"
              value={presentacionId}
              onChange={(evento) => setPresentacionId(evento.target.value)}
              disabled={!varianteSeleccionada}
            >
              <option value="">Selecciona una presentación</option>
              {preciosDisponibles.map((precio) => (
                <option key={precio.presentacion_id} value={precio.presentacion_id}>
                  {precio.presentacion} · {formatoMoneda.format(Number(precio.precio))}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-cotizacion">
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
            <button
              className="boton-primario-cotizaciones"
              type="button"
              onClick={agregarLinea}
            >
              Agregar
            </button>
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
                          >
                            Quitar
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
            <small>El total guardado por PostgreSQL es el valor definitivo.</small>
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
          Cancelar
        </button>
        <button
          className="boton-primario-cotizaciones"
          type="submit"
          disabled={guardando}
        >
          {guardando
            ? 'Guardando...'
            : cotizacionId
              ? 'Guardar cambios'
              : 'Crear borrador'}
        </button>
      </footer>
    </form>
  )
}

export default CotizacionFormulario
