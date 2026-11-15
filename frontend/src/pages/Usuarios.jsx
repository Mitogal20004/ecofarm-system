import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, UserPlus } from 'lucide-react'
import './Usuarios.css'
import EditarUsuarioDialog from '../components/EditarUsuarioDialog'
import EstadoEtiqueta from '../components/EstadoEtiqueta'
import NuevoUsuarioDialog from '../components/NuevoUsuarioDialog'
import {
  listarUsuarios,
  obtenerDetalleUsuario,
} from '../services/usuarios'

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

function Usuarios({ permisos, usuarioActualId, alRefrescarAutorizacion }) {
  const [usuarios, setUsuarios] = useState([])
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('todos')
  const [selectorEstadoAbierto, setSelectorEstadoAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const [cargandoDetalleId, setCargandoDetalleId] = useState(null)
  const [errorAccion, setErrorAccion] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [actualizacionListado, setActualizacionListado] = useState(0)

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
        setDialogoAbierto(false)
        setUsuarioEditando(null)
        setError(obtenerMensajeError(errorConsulta))

        if ([401, 403].includes(errorConsulta?.status)) {
          alRefrescarAutorizacion()
        }
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
  }, [
    actualizacionListado,
    alRefrescarAutorizacion,
    busquedaAplicada,
    filtroActivo,
    pagina,
  ])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setPagina(1)
      setBusquedaAplicada(busqueda.trim())
    }, 1000)

    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const manejarFiltro = (evento) => {
    setFiltroActivo(evento.target.value)
    setPagina(1)
  }

  const abrirDialogo = () => {
    setMensajeExito('')
    setDialogoAbierto(true)
  }

  const manejarUsuarioCreado = () => {
    setDialogoAbierto(false)
    setMensajeExito('Usuario creado correctamente.')
    setPagina(1)
    setActualizacionListado((actual) => actual + 1)
  }

  const abrirEdicion = async (usuario) => {
    setMensajeExito('')
    setErrorAccion('')
    setCargandoDetalleId(usuario.id)

    try {
      const detalle = await obtenerDetalleUsuario(usuario.id)
      const usuarioDetallado = {
        ...detalle.usuario,
        roles: detalle.roles,
      }
      const esAdministrador = detalle.roles.some(
        (rol) => rol.nombre === 'Administrador',
      )

      if (esAdministrador && !permisos.includes('rol.administrar')) {
        setErrorAccion('No tienes permiso para modificar un Administrador.')
        return
      }

      setUsuarioEditando(usuarioDetallado)
    } catch (errorDetalle) {
      if ([401, 403].includes(errorDetalle?.status)) {
        alRefrescarAutorizacion()
      }

      if (errorDetalle?.status === 401) {
        setErrorAccion('Tu sesión ya no es válida. Vuelve a iniciar sesión.')
      } else if (errorDetalle?.status === 403) {
        setErrorAccion('No tienes permiso para consultar este usuario.')
      } else if (errorDetalle?.status === 404) {
        setErrorAccion('El usuario solicitado ya no existe.')
      } else {
        setErrorAccion('No fue posible consultar el usuario.')
      }
    } finally {
      setCargandoDetalleId(null)
    }
  }

  const manejarUsuarioActualizado = (usuarioId) => {
    setActualizacionListado((actual) => actual + 1)

    if (usuarioId === usuarioActualId) {
      alRefrescarAutorizacion()
    }
  }

  const puedeAdministrarUsuarios = permisos.includes('usuario.administrar')
  const puedeAdministrarRoles = permisos.includes('rol.administrar')
  const usuarioEsAdministrador = (usuario) =>
    Array.isArray(usuario.roles) &&
    usuario.roles.some((rol) => rol.nombre === 'Administrador')

  const puedeRetroceder = pagina > 1 && !cargando
  const puedeAvanzar =
    paginacion.total_paginas > 0 &&
    pagina < paginacion.total_paginas &&
    !cargando

  return (
    <section className="pagina-usuarios" aria-labelledby="titulo-usuarios">
      <header className="encabezado-usuarios">
        <h1 id="titulo-usuarios">Usuarios</h1>
        {puedeAdministrarUsuarios && (
          <button
            className="boton-nuevo-usuario"
            type="button"
            onClick={abrirDialogo}
          >
            <UserPlus size={17} strokeWidth={2} aria-hidden="true" />
            Nuevo usuario
          </button>
        )}
      </header>

      {mensajeExito && (
        <p className="mensaje-exito-usuario" role="status">
          {mensajeExito}
        </p>
      )}

      {errorAccion && (
        <p className="mensaje-error-usuarios" role="alert">
          {errorAccion}
        </p>
      )}

      <div className="filtros-usuarios">
        <header className="encabezado-filtros-usuarios">
          <div>
            <h2>Filtros</h2>
            <p>Busca personal por nombre, correo o serie y filtra por estado.</p>
          </div>
          {!cargando && (
            <span>
              {paginacion.total} {paginacion.total === 1 ? 'usuario' : 'usuarios'}
            </span>
          )}
        </header>
        <div className="control-busqueda">
          <label htmlFor="busqueda-usuarios">Buscar usuarios</label>
          <div className="campo-busqueda-usuarios">
            <input
              id="busqueda-usuarios"
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre, correo o serie"
              maxLength={150}
            />
          </div>
        </div>

        <div className="control-filtro-estado">
          <label htmlFor="filtro-estado-usuarios">Estado</label>
          <div className="selector-estado-usuarios">
            <button
            id="filtro-estado-usuarios"
            className="boton-selector-estado-usuarios"
            type="button"
            onClick={() => setSelectorEstadoAbierto((abierto) => !abierto)}
            disabled={cargando}
            aria-haspopup="listbox"
            aria-expanded={selectorEstadoAbierto}
          >
              {filtroActivo === 'todos'
                ? 'Todos'
                : filtroActivo === 'activos'
                  ? 'Activos'
                  : 'Inactivos'}
              <span aria-hidden="true">⌄</span>
            </button>
            {selectorEstadoAbierto && (
              <div className="lista-estados-usuarios" role="listbox" aria-label="Selecciona un estado">
                {[
                  ['todos', 'Todos'],
                  ['activos', 'Activos'],
                  ['inactivos', 'Inactivos'],
                ].map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="option"
                    aria-selected={valor === filtroActivo}
                    onClick={() => {
                      manejarFiltro({ target: { value: valor } })
                      setSelectorEstadoAbierto(false)
                    }}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
                  <th scope="col">Serie</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Estado</th>
                  {puedeAdministrarUsuarios && (
                    <th scope="col" className="columna-acciones-usuarios">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td className="nombre-usuario-tabla" data-label="Nombre">
                      {usuario.nombre_completo}
                    </td>
                    <td data-label="Serie">
                      {usuario.serie_documentos ? (
                        <span className="serie-documentos-usuario">
                          {usuario.serie_documentos}
                        </span>
                      ) : (
                        <span className="serie-documentos-sin-asignar">
                          Sin asignar
                        </span>
                      )}
                    </td>
                    <td className="correo-usuario-tabla" data-label="Correo">
                      {usuario.email}
                    </td>
                    <td data-label="Teléfono">{usuario.telefono || '—'}</td>
                    <td data-label="Roles">
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
                    <td data-label="Estado">
                      <EstadoEtiqueta
                        tono={usuario.activo ? 'positivo' : 'peligro'}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </EstadoEtiqueta>
                    </td>
                    {puedeAdministrarUsuarios && (
                      <td
                        className="celda-acciones-usuarios"
                        data-label="Acciones"
                      >
                        {puedeAdministrarRoles ||
                        !usuarioEsAdministrador(usuario) ? (
                          <button
                            className="boton-editar-usuario"
                            type="button"
                            onClick={() => abrirEdicion(usuario)}
                            disabled={cargandoDetalleId !== null}
                            aria-label={`Editar a ${usuario.nombre_completo}`}
                          >
                            {cargandoDetalleId === usuario.id ? (
                              'Consultando...'
                            ) : (
                              <>
                                <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                                Editar
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="dato-no-disponible" aria-label="Sin acciones disponibles">
                            —
                          </span>
                        )}
                      </td>
                    )}
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
              <ChevronLeft size={17} strokeWidth={2} aria-hidden="true" />
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
              <ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>

      <NuevoUsuarioDialog
        abierto={dialogoAbierto && puedeAdministrarUsuarios}
        alCerrar={() => setDialogoAbierto(false)}
        alCrear={manejarUsuarioCreado}
        puedeAdministrarRoles={puedeAdministrarRoles}
        alRefrescarAutorizacion={alRefrescarAutorizacion}
      />

      {usuarioEditando &&
        puedeAdministrarUsuarios &&
        (puedeAdministrarRoles || !usuarioEsAdministrador(usuarioEditando)) && (
          <EditarUsuarioDialog
            key={usuarioEditando.id}
            usuario={usuarioEditando}
            puedeAdministrarRoles={puedeAdministrarRoles}
            alCerrar={() => setUsuarioEditando(null)}
            alActualizar={manejarUsuarioActualizado}
            alRefrescarAutorizacion={alRefrescarAutorizacion}
          />
        )}
    </section>
  )
}

export default Usuarios
