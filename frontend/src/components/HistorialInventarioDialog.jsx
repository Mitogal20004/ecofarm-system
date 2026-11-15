import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import * as XLSX from 'xlsx-js-style'
import { listarMovimientos } from '../services/inventario'

const LIMITE_MOVIMIENTOS = 15
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_MOVIMIENTOS,
  total: 0,
  total_paginas: 0,
}

const nombreTipo = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

const nombreClasificacion = {
  normal: 'Normal',
  completa: 'Completa',
  premium: 'Premium',
}

const formatearFecha = (valor) =>
  new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(valor))

const obtenerFechaCalendario = (valor) => {
  if (!valor) return new Date()
  const [anio, mes, dia] = valor.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

function SelectorFechaHistorial({ label, value, onChange, disabled }) {
  const [abierto, setAbierto] = useState(false)
  const [mesVisible, setMesVisible] = useState(() => obtenerFechaCalendario(value))
  const contenedorRef = useRef(null)
  const fechaSeleccionada = value ? obtenerFechaCalendario(value) : null
  const primerDia = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1)
  const diasEnMes = new Date(
    mesVisible.getFullYear(),
    mesVisible.getMonth() + 1,
    0,
  ).getDate()
  const desplazamiento = (primerDia.getDay() + 6) % 7
  const dias = Array.from({ length: desplazamiento + diasEnMes }, (_, indice) =>
    indice < desplazamiento ? null : indice - desplazamiento + 1,
  )
  const nombreMes = new Intl.DateTimeFormat('es-GT', {
    month: 'long',
    year: 'numeric',
  }).format(mesVisible)

  useEffect(() => {
    if (!abierto) return undefined
    const cerrarAlHacerClicFuera = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrarAlHacerClicFuera)
    return () => document.removeEventListener('pointerdown', cerrarAlHacerClicFuera)
  }, [abierto])

  const seleccionarDia = (dia) => {
    const anio = mesVisible.getFullYear()
    const mes = String(mesVisible.getMonth() + 1).padStart(2, '0')
    onChange(`${anio}-${mes}-${String(dia).padStart(2, '0')}`)
    setAbierto(false)
  }

  return (
    <div className="selector-fecha-historial-inventario" ref={contenedorRef}>
      <span className="etiqueta-selector-fecha-historial">{label}</span>
      <button
        className="boton-selector-fecha-historial"
        type="button"
        onClick={() => {
          setMesVisible(obtenerFechaCalendario(value))
          setAbierto((actual) => !actual)
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        <span>{fechaSeleccionada
          ? `${String(fechaSeleccionada.getDate()).padStart(2, '0')}/${String(fechaSeleccionada.getMonth() + 1).padStart(2, '0')}/${fechaSeleccionada.getFullYear()}`
          : 'dd/mm/aaaa'}</span>
        <CalendarDays size={17} strokeWidth={2} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="calendario-historial" role="dialog" aria-label={`Seleccionar fecha ${label}`}>
          <header>
            <strong>{nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</strong>
            <div>
              <button
                type="button"
                onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1))}
                aria-label="Mes anterior"
              >
                <ChevronLeft size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="dias-semana-calendario" aria-hidden="true">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="dias-calendario" role="grid">
            {dias.map((dia, indice) => {
              if (!dia) return <span key={`vacio-${indice}`} aria-hidden="true" />
              const esSeleccionado = fechaSeleccionada &&
                fechaSeleccionada.getFullYear() === mesVisible.getFullYear() &&
                fechaSeleccionada.getMonth() === mesVisible.getMonth() &&
                fechaSeleccionada.getDate() === dia
              return (
                <button
                  key={dia}
                  type="button"
                  role="gridcell"
                  aria-selected={esSeleccionado}
                  onClick={() => seleccionarDia(dia)}
                >
                  {dia}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function HistorialInventarioDialog({
  varianteInicial,
  opcionesBusqueda = [],
  alCerrar,
  alRefrescarAutorizacion,
}) {
  const [movimientos, setMovimientos] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [tipoAplicado, setTipoAplicado] = useState('todos')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaDesdeAplicada, setFechaDesdeAplicada] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [fechaHastaAplicada, setFechaHastaAplicada] = useState('')
  const [varianteFiltro, setVarianteFiltro] = useState(varianteInicial ?? null)
  const [listaBusquedaAbierta, setListaBusquedaAbierta] = useState(false)
  const [listaTipoAbierta, setListaTipoAbierta] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [exportando, setExportando] = useState(false)
  const botonCerrarRef = useRef(null)

  const consultar = useCallback(async () => {
    setCargando(true)
    setError('')

    if (
      fechaDesdeAplicada &&
      fechaHastaAplicada &&
      fechaDesdeAplicada > fechaHastaAplicada
    ) {
      setMovimientos([])
      setPaginacion(PAGINACION_INICIAL)
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      setCargando(false)
      return
    }

    try {
      const resultado = await listarMovimientos({
        pagina,
        limite: LIMITE_MOVIMIENTOS,
        busqueda: busquedaAplicada || undefined,
        variante_id: varianteFiltro?.variante_id,
        tipo: tipoAplicado === 'todos' ? undefined : tipoAplicado,
        fecha_desde: fechaDesdeAplicada || undefined,
        fecha_hasta: fechaHastaAplicada || undefined,
      })
      setMovimientos(resultado.movimientos)
      setPaginacion(resultado.paginacion)
    } catch (errorConsulta) {
      setMovimientos([])
      setPaginacion(PAGINACION_INICIAL)

      if (errorConsulta?.status === 403) {
        setError('No tienes permiso para consultar movimientos.')
      } else if (errorConsulta?.status === 401) {
        setError('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else {
        setError('No fue posible cargar el historial de movimientos.')
      }

      if ([401, 403].includes(errorConsulta?.status)) {
        alRefrescarAutorizacion()
      }
    } finally {
      setCargando(false)
    }
  }, [
    alRefrescarAutorizacion,
    busquedaAplicada,
    fechaDesdeAplicada,
    fechaHastaAplicada,
    pagina,
    tipoAplicado,
    varianteFiltro,
  ])

  useEffect(() => {
    const temporizador = window.setTimeout(consultar, 0)
    return () => window.clearTimeout(temporizador)
  }, [consultar])

  useEffect(() => {
    if (
      tipo === tipoAplicado &&
      fechaDesde === fechaDesdeAplicada &&
      fechaHasta === fechaHastaAplicada
    ) {
      return undefined
    }

    const temporizador = window.setTimeout(() => {
      setTipoAplicado(tipo)
      setFechaDesdeAplicada(fechaDesde)
      setFechaHastaAplicada(fechaHasta)
      setPagina(1)
    }, 1000)

    return () => window.clearTimeout(temporizador)
  }, [
    fechaDesde,
    fechaDesdeAplicada,
    fechaHasta,
    fechaHastaAplicada,
    tipo,
    tipoAplicado,
  ])

  useEffect(() => {
    const valorBusqueda = busqueda.trim()
    if (valorBusqueda === busquedaAplicada) return undefined

    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(valorBusqueda)
      setPagina(1)
      setListaBusquedaAbierta(false)
    }, 1000)

    return () => window.clearTimeout(temporizador)
  }, [busqueda, busquedaAplicada])

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => botonCerrarRef.current?.focus(),
      0,
    )
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const manejarTeclado = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', manejarTeclado)
    return () => {
      window.clearTimeout(temporizador)
      document.removeEventListener('keydown', manejarTeclado)
      document.body.style.overflow = overflowAnterior
    }
  }, [alCerrar])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setListaBusquedaAbierta(false)
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  const exportarExcel = async () => {
    setExportando(true)

    try {
      const filtros = {
        limite: 100,
        busqueda: busquedaAplicada || undefined,
        variante_id: varianteFiltro?.variante_id,
        tipo: tipoAplicado === 'todos' ? undefined : tipoAplicado,
        fecha_desde: fechaDesdeAplicada || undefined,
        fecha_hasta: fechaHastaAplicada || undefined,
      }
      const primeraPagina = await listarMovimientos({ pagina: 1, ...filtros })
      const todosLosMovimientos = [...primeraPagina.movimientos]

      for (let paginaExportacion = 2;
        paginaExportacion <= primeraPagina.paginacion.total_paginas;
        paginaExportacion += 1) {
        const resultado = await listarMovimientos({
          pagina: paginaExportacion,
          ...filtros,
        })
        todosLosMovimientos.push(...resultado.movimientos)
      }

      const filas = todosLosMovimientos.map((movimiento) => [
        movimiento.id,
        formatearFecha(movimiento.fecha_movimiento),
        movimiento.variante?.codigo_sku,
        movimiento.variante?.color,
        movimiento.variante?.longitud_cm,
        nombreClasificacion[movimiento.variante?.clasificacion],
        nombreTipo[movimiento.tipo],
        movimiento.variacion_manojos,
        movimiento.saldo_anterior,
        movimiento.saldo_posterior,
        movimiento.motivo,
        movimiento.origen,
        movimiento.usuario?.nombre_completo ?? 'Usuario',
      ])
      const encabezados = [
        'ID', 'Fecha', 'SKU', 'Color', 'Longitud (cm)', 'Clasificación',
        'Tipo', 'Variación', 'Saldo anterior', 'Saldo nuevo', 'Motivo',
        'Origen', 'Usuario',
      ]
      const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
      hoja['!cols'] = [
        36, 22, 22, 16, 14, 18, 14, 14, 16, 16, 36, 20, 32,
      ].map((wch) => ({ wch }))
      hoja['!autofilter'] = { ref: `A1:M${filas.length + 1}` }
      hoja['!freeze'] = { xSplit: 0, ySplit: 1 }

      for (let columna = 0; columna < encabezados.length; columna += 1) {
        const celda = hoja[XLSX.utils.encode_cell({ r: 0, c: columna })]
        celda.s = {
          fill: { fgColor: { rgb: '274A4D' } },
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '1F3A3D' } } },
        }
      }

      for (let fila = 1; fila <= filas.length; fila += 1) {
        for (let columna = 0; columna < encabezados.length; columna += 1) {
          const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })]
          celda.s = {
            fill: { fgColor: { rgb: fila % 2 === 0 ? 'F2F6F2' : 'FFFFFF' } },
            border: { bottom: { style: 'thin', color: { rgb: 'D9E1DB' } } },
            alignment: { vertical: 'center' },
          }
        }
      }

      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Historial')
      XLSX.writeFile(
        libro,
        `historial-movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`,
      )
    } catch (errorExportacion) {
      setError(errorExportacion?.message || 'No fue posible exportar el historial.')
    } finally {
      setExportando(false)
    }
  }

  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando
  const opcionesBusquedaVisibles = opcionesBusqueda.filter((opcion) =>
    opcion.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()),
  )

  return (
    <div
      className="fondo-dialogo-inventario"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
    >
      <section
        className={`dialogo-inventario dialogo-historial-inventario${pantallaCompleta ? ' dialogo-historial-pantalla-completa' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-historial-inventario"
      >
        <header className="encabezado-dialogo-inventario">
          <div>
            <p className="etiqueta-dialogo-inventario">Auditoría</p>
            <h2 id="titulo-historial-inventario">Historial de movimientos</h2>
            <p>Registro de solo lectura, ordenado del más reciente al más antiguo.</p>
          </div>
          <div className="acciones-encabezado-dialogo-inventario">
            <button
              className="boton-exportar-dialogo-inventario"
              type="button"
              onClick={exportarExcel}
              disabled={exportando || cargando}
            >
              <Download size={16} strokeWidth={2.1} aria-hidden="true" />
              {exportando ? 'Exportando...' : 'Exportar'}
            </button>
            <button
              className="boton-ampliar-dialogo-inventario"
              type="button"
              onClick={() => setPantallaCompleta((actual) => !actual)}
              aria-label={pantallaCompleta ? 'Restaurar tamaño del historial' : 'Ver historial en pantalla completa'}
              title={pantallaCompleta ? 'Restaurar tamaño' : 'Pantalla completa'}
            >
              {pantallaCompleta ? (
                <Minimize2 size={17} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Maximize2 size={17} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
            <button
              ref={botonCerrarRef}
              className="boton-cerrar-dialogo-inventario"
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar historial"
              title="Cerrar"
            >
              ×
            </button>
          </div>
        </header>

        <div className="contenido-historial-inventario">
          {varianteFiltro && (
            <div className="filtro-variante-historial">
              <span>
                Variante: <strong>{varianteFiltro.codigo_sku} · {varianteFiltro.color}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setVarianteFiltro(null)
                  setPagina(1)
                }}
              >
                Ver todas
              </button>
            </div>
          )}

          <form className="filtros-historial-inventario" onSubmit={manejarBusqueda}>
            <div className="control-busqueda-inventario">
              <label htmlFor="busqueda-historial-inventario">Buscar variante</label>
              <div className="entrada-busqueda-inventario">
                <input
                  id="busqueda-historial-inventario"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={listaBusquedaAbierta}
                  aria-controls="opciones-busqueda-historial-inventario"
                  value={busqueda}
                  onFocus={() => setListaBusquedaAbierta(true)}
                  onBlur={() => {
                    window.setTimeout(() => setListaBusquedaAbierta(false), 0)
                  }}
                  onChange={(evento) => {
                    setBusqueda(evento.target.value)
                    setListaBusquedaAbierta(true)
                  }}
                  placeholder="SKU o color"
                  maxLength={150}
                />
                {listaBusquedaAbierta && opcionesBusquedaVisibles.length > 0 && (
                  <div
                    id="opciones-busqueda-historial-inventario"
                    className="lista-opciones-busqueda-inventario"
                    role="listbox"
                  >
                    {opcionesBusquedaVisibles.map((opcion) => (
                      <button
                        key={opcion}
                        type="button"
                        role="option"
                        aria-selected={opcion === busqueda}
                        onMouseDown={(evento) => evento.preventDefault()}
                        onClick={() => {
                          setBusqueda(opcion)
                          setBusquedaAplicada(opcion)
                          setPagina(1)
                          setListaBusquedaAbierta(false)
                        }}
                      >
                        {opcion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="control-filtro-inventario">
              <label htmlFor="tipo-historial-inventario">Tipo</label>
              <div className="selector-filtro-inventario">
                <button
                  id="tipo-historial-inventario"
                  className="boton-selector-filtro-inventario"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={listaTipoAbierta}
                  aria-controls="opciones-tipo-historial-inventario"
                  onClick={() => setListaTipoAbierta((abierto) => !abierto)}
                  onBlur={() => {
                    window.setTimeout(() => setListaTipoAbierta(false), 0)
                  }}
                  disabled={cargando}
                >
                  {tipo === 'todos' ? 'Todos' : nombreTipo[tipo]}
                  <span aria-hidden="true">⌄</span>
                </button>
                {listaTipoAbierta && (
                  <div
                    id="opciones-tipo-historial-inventario"
                    className="lista-opciones-busqueda-inventario lista-opciones-tipo-inventario"
                    role="listbox"
                  >
                    {[
                      ['todos', 'Todos'],
                      ['entrada', 'Entrada'],
                      ['salida', 'Salida'],
                      ['ajuste', 'Ajuste'],
                    ].map(([valor, etiqueta]) => (
                      <button
                        key={valor}
                        type="button"
                        role="option"
                        aria-selected={tipo === valor}
                        onMouseDown={(evento) => evento.preventDefault()}
                        onClick={() => {
                          setTipo(valor)
                          setListaTipoAbierta(false)
                        }}
                      >
                        {etiqueta}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <SelectorFechaHistorial
              label="Desde"
              value={fechaDesde}
              onChange={setFechaDesde}
              disabled={cargando}
            />
            <SelectorFechaHistorial
              label="Hasta"
              value={fechaHasta}
              onChange={setFechaHasta}
              disabled={cargando}
            />
          </form>

          <div className="contenedor-historial-inventario">
            {cargando ? (
              <p className="estado-listado-inventario" aria-live="polite">
                Consultando movimientos...
              </p>
            ) : error ? (
              <p className="mensaje-error-inventario" role="alert">{error}</p>
            ) : movimientos.length === 0 ? (
              <p className="estado-listado-inventario">No se encontraron movimientos.</p>
            ) : (
              <div className="desplazamiento-tabla-inventario">
                <table className="tabla-historial-inventario">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Variante</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Variación</th>
                      <th scope="col">Anterior</th>
                      <th scope="col">Nuevo</th>
                      <th scope="col">Motivo</th>
                      <th scope="col">Origen</th>
                      <th scope="col">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((movimiento) => (
                      <tr key={movimiento.id}>
                        <td><code>{movimiento.id}</code></td>
                        <td>{formatearFecha(movimiento.fecha_movimiento)}</td>
                        <td>
                          <strong>{movimiento.variante.codigo_sku}</strong>
                          <small>
                            {movimiento.variante.color} · {movimiento.variante.longitud_cm} cm · {' '}
                            {nombreClasificacion[movimiento.variante.clasificacion]}
                          </small>
                        </td>
                        <td>{nombreTipo[movimiento.tipo]}</td>
                        <td className={
                          movimiento.variacion_manojos > 0
                            ? 'variacion-positiva'
                            : 'variacion-negativa'
                        }>
                          {movimiento.variacion_manojos > 0 ? '+' : ''}
                          {movimiento.variacion_manojos}
                        </td>
                        <td>{movimiento.saldo_anterior}</td>
                        <td>{movimiento.saldo_posterior}</td>
                        <td>{movimiento.motivo}</td>
                        <td>{movimiento.origen}</td>
                        <td>{movimiento.usuario?.nombre_completo ?? 'Usuario'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!cargando && !error && (
            <footer className="paginacion-inventario">
              <button
                type="button"
                onClick={() => setPagina((actual) => actual - 1)}
                disabled={!puedeRetroceder}
                className="boton-paginacion-flecha-inventario"
                aria-label="Página anterior"
                title="Página anterior"
              >
                <ChevronLeft size={19} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <span>
                Página {paginacion.pagina} de {Math.max(paginacion.total_paginas, 1)}
                {' · '}{paginacion.total} movimientos
              </span>
              <button
                type="button"
                onClick={() => setPagina((actual) => actual + 1)}
                disabled={!puedeAvanzar}
                className="boton-paginacion-flecha-inventario"
                aria-label="Página siguiente"
                title="Página siguiente"
              >
                <ChevronRight size={19} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </footer>
          )}
        </div>
      </section>
    </div>
  )
}

export default HistorialInventarioDialog
