import { useCallback, useEffect, useState } from 'react'
import './Clientes.css'
import ClienteDialog from '../components/ClienteDialog'
import { obtenerAutorizacionActual } from '../services/auth'
import { listarClientes } from '../services/clientes'

const LIMITE_CLIENTES = 10
const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_CLIENTES,
  total: 0,
  total_paginas: 0,
}

const obtenerMensajeConsulta = (error) => {
  if (error?.status === 403) {
    return 'No tienes permiso para consultar clientes.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  return 'No fue posible cargar los clientes.'
}

function Clientes() {
  const [clientes, setClientes] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [permisos, setPermisos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [versionListado, setVersionListado] = useState(0)

  const cerrarDialogo = useCallback(() => {
    setDialogoAbierto(false)
    setClienteEditando(null)
  }, [])

  useEffect(() => {
    let vistaActiva = true

    const consultar = async () => {
      setCargando(true)
      setError('')

      try {
        const [resultado, autorizacion] = await Promise.all([
          listarClientes({
            pagina,
            limite: LIMITE_CLIENTES,
            busqueda: busquedaAplicada || undefined,
            activo:
              filtroActivo === 'todos'
                ? undefined
                : filtroActivo === 'activos',
            tipo: filtroTipo === 'todos' ? undefined : filtroTipo,
          }),
          obtenerAutorizacionActual(),
        ])

        if (!vistaActiva) return

        setClientes(resultado.clientes)
        setPaginacion(resultado.paginacion)
        setPermisos(
          autorizacion.permisos
            .map((permiso) => permiso?.codigo)
            .filter((codigo) => typeof codigo === 'string'),
        )
      } catch (errorConsulta) {
        if (!vistaActiva) return

        setClientes([])
        setPaginacion(PAGINACION_INICIAL)
        setPermisos([])
        cerrarDialogo()
        setError(obtenerMensajeConsulta(errorConsulta))
      } finally {
        if (vistaActiva) setCargando(false)
      }
    }

    consultar()

    return () => {
      vistaActiva = false
    }
  }, [
    busquedaAplicada,
    cerrarDialogo,
    filtroActivo,
    filtroTipo,
    pagina,
    versionListado,
  ])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  const abrirCreacion = () => {
    setMensajeExito('')
    setClienteEditando(null)
    setDialogoAbierto(true)
  }

  const abrirEdicion = (cliente) => {
    setMensajeExito('')
    setClienteEditando(cliente)
    setDialogoAbierto(true)
  }

  const manejarGuardado = (_cliente, editando) => {
    cerrarDialogo()
    setMensajeExito(
      editando
        ? 'Cliente actualizado correctamente.'
        : 'Cliente creado correctamente.',
    )

    if (!editando) setPagina(1)
    setVersionListado((version) => version + 1)
  }

  const puedeCrear = permisos.includes('cliente.crear')
  const puedeEditar = permisos.includes('cliente.editar')
  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-clientes" aria-labelledby="titulo-clientes">
      <header className="encabezado-clientes">
        <div>
          <p className="etiqueta-seccion">Gestión comercial</p>
          <h1 id="titulo-clientes">Clientes</h1>
          <p>Consulta y administra clientes individuales y empresas.</p>
        </div>
        {puedeCrear && (
          <button
            className="boton-nuevo-cliente"
            type="button"
            onClick={abrirCreacion}
          >
            + Nuevo cliente
          </button>
        )}
      </header>

      {mensajeExito && (
        <p className="mensaje-exito-clientes" role="status">
          {mensajeExito}
        </p>
      )}

      <form className="filtros-clientes" onSubmit={manejarBusqueda}>
        <div className="control-busqueda-clientes">
          <label htmlFor="busqueda-clientes">Buscar clientes</label>
          <div>
            <input
              id="busqueda-clientes"
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Nombre, razón social o NIT"
              maxLength={150}
            />
            <button type="submit" disabled={cargando}>Buscar</button>
          </div>
        </div>

        <div className="control-filtro-clientes">
          <label htmlFor="filtro-tipo-clientes">Tipo</label>
          <select
            id="filtro-tipo-clientes"
            value={filtroTipo}
            onChange={(evento) => {
              setFiltroTipo(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todos">Todos</option>
            <option value="individual">Individual</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>

        <div className="control-filtro-clientes">
          <label htmlFor="filtro-estado-clientes">Estado</label>
          <select
            id="filtro-estado-clientes"
            value={filtroActivo}
            onChange={(evento) => {
              setFiltroActivo(evento.target.value)
              setPagina(1)
            }}
            disabled={cargando}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </form>

      <div className="contenedor-listado-clientes">
        {cargando ? (
          <p className="estado-listado-clientes" aria-live="polite">
            Consultando clientes...
          </p>
        ) : error ? (
          <p className="estado-listado-clientes estado-error-clientes" role="alert">
            {error}
          </p>
        ) : clientes.length === 0 ? (
          <p className="estado-listado-clientes">No se encontraron clientes.</p>
        ) : (
          <div className="desplazamiento-tabla-clientes">
            <table className="tabla-clientes">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">NIT</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Estado</th>
                  {puedeEditar && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => (
                  <tr key={cliente.id}>
                    <td className="nombre-cliente-tabla">
                      {cliente.nombre_completo ?? cliente.razon_social}
                    </td>
                    <td>{cliente.tipo === 'individual' ? 'Individual' : 'Empresa'}</td>
                    <td>{cliente.nit}</td>
                    <td className="contacto-cliente-tabla">
                      <span>{cliente.telefono || 'Sin teléfono'}</span>
                      <small>{cliente.correo_electronico || 'Sin correo'}</small>
                    </td>
                    <td>
                      <span
                        className={`estado-cliente ${
                          cliente.activo
                            ? 'estado-cliente-activo'
                            : 'estado-cliente-inactivo'
                        }`}
                      >
                        {cliente.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {puedeEditar && (
                      <td>
                        <button
                          className="boton-editar-cliente"
                          type="button"
                          onClick={() => abrirEdicion(cliente)}
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!cargando && !error && (
          <footer className="paginacion-clientes">
            <button
              type="button"
              onClick={() => setPagina((actual) => actual - 1)}
              disabled={!puedeRetroceder}
            >
              Anterior
            </button>
            <span>
              Página {paginacion.pagina} de {Math.max(paginacion.total_paginas, 1)}
              {' · '}{paginacion.total} clientes
            </span>
            <button
              type="button"
              onClick={() => setPagina((actual) => actual + 1)}
              disabled={!puedeAvanzar}
            >
              Siguiente
            </button>
          </footer>
        )}
      </div>

      {dialogoAbierto && (
        <ClienteDialog
          key={clienteEditando?.id ?? 'nuevo-cliente'}
          abierto
          cliente={clienteEditando}
          alCerrar={cerrarDialogo}
          alGuardar={manejarGuardado}
        />
      )}
    </section>
  )
}

export default Clientes
