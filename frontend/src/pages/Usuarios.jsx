import { useEffect, useState } from 'react'
import './Usuarios.css'
import { listarUsuarios } from '../services/usuarios'

const LIMITE_USUARIOS = 10

const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_USUARIOS,
  total: 0,
  total_paginas: 0,
}

function obtenerMensajeError(error) {
  if (error?.status === 403) {
    return 'No tienes permiso para consultar usuarios.'
  }

  if (error?.status === 401) {
    return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  }

  return 'No fue posible cargar los usuarios.'
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vistaActiva = true

    const consultarUsuarios = async () => {
      setCargando(true)
      setError('')

      try {
        const resultado = await listarUsuarios({
          pagina,
          limite: LIMITE_USUARIOS,
          busqueda: busquedaAplicada || undefined,
          activo:
            filtroActivo === 'todos'
              ? undefined
              : filtroActivo === 'activos',
        })

        if (!vistaActiva) return

        setUsuarios(resultado.usuarios)
        setPaginacion(resultado.paginacion)
      } catch (errorConsulta) {
        if (!vistaActiva) return

        setUsuarios([])
        setPaginacion(PAGINACION_INICIAL)
        setError(obtenerMensajeError(errorConsulta))
      } finally {
        if (vistaActiva) {
          setCargando(false)
        }
      }
    }

    consultarUsuarios()

    return () => {
      vistaActiva = false
    }
  }, [busquedaAplicada, filtroActivo, pagina])

  const manejarBusqueda = (evento) => {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  const manejarFiltro = (evento) => {
    setFiltroActivo(evento.target.value)
    setPagina(1)
  }

  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-usuarios" aria-labelledby="titulo-usuarios">
      <header className="encabezado-usuarios">
        <p className="etiqueta-seccion">Administración</p>
        <h1 id="titulo-usuarios">Usuarios</h1>
        <p>Consulta y administra el personal con acceso a E-farm.</p>
      </header>

      <form className="filtros-usuarios" onSubmit={manejarBusqueda}>
        <div className="control-busqueda">
          <label htmlFor="busqueda-usuarios">Buscar usuarios</label>
          <div className="campo-busqueda-usuarios">
            <input
              id="busqueda-usuarios"
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre o correo"
              maxLength={150}
            />
            <button type="submit" disabled={cargando}>
              Buscar
            </button>
          </div>
        </div>

        <div className="control-filtro-estado">
          <label htmlFor="filtro-estado-usuarios">Estado</label>
          <select
            id="filtro-estado-usuarios"
            value={filtroActivo}
            onChange={manejarFiltro}
            disabled={cargando}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </form>

      <div className="contenedor-listado-usuarios">
        {cargando ? (
          <p className="estado-listado-usuarios" aria-live="polite">
            Consultando usuarios...
          </p>
        ) : error ? (
          <p className="estado-listado-usuarios estado-error-usuarios" role="alert">
            {error}
          </p>
        ) : usuarios.length === 0 ? (
          <p className="estado-listado-usuarios">No se encontraron usuarios.</p>
        ) : (
          <div className="desplazamiento-tabla-usuarios">
            <table className="tabla-usuarios">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td className="nombre-usuario-tabla">
                      {usuario.nombre_completo}
                    </td>
                    <td className="correo-usuario-tabla">{usuario.email}</td>
                    <td>{usuario.telefono || '—'}</td>
                    <td>
                      <div className="roles-usuario">
                        {Array.isArray(usuario.roles) &&
                        usuario.roles.length > 0 ? (
                          usuario.roles.map((rol) => (
                            <span
                              className={`etiqueta-rol${
                                rol.activo ? '' : ' etiqueta-rol-inactivo'
                              }`}
                              key={rol.id}
                              title={rol.activo ? undefined : 'Rol inactivo'}
                            >
                              {rol.nombre}
                            </span>
                          ))
                        ) : (
                          <span className="dato-no-disponible">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`etiqueta-estado-usuario ${
                          usuario.activo
                            ? 'estado-usuario-activo'
                            : 'estado-usuario-inactivo'
                        }`}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!cargando && !error && paginacion.total_paginas > 0 && (
          <nav className="paginacion-usuarios" aria-label="Paginación de usuarios">
            <button
              type="button"
              onClick={() => setPagina((actual) => actual - 1)}
              disabled={!puedeRetroceder}
            >
              Anterior
            </button>
            <span>
              Página {paginacion.pagina} de {paginacion.total_paginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((actual) => actual + 1)}
              disabled={!puedeAvanzar}
            >
              Siguiente
            </button>
          </nav>
        )}
      </div>
    </section>
  )
}

export default Usuarios
