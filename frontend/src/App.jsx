import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import iconoCerrarSesion from './assets/icono-cerrar-sesion.svg'
import logoEfarm from './assets/logo-efarm-brand.png'
import IconoInterfaz from './components/IconoInterfaz'
import Login from './pages/Login'
import RecuperarPassword from './pages/RecuperarPassword'
import RestablecerPassword from './pages/RestablecerPassword'
import Clientes from './pages/Clientes'
import Cotizaciones from './pages/Cotizaciones'
import Inventario from './pages/Inventario'
import Productos from './pages/Productos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Ventas from './pages/Ventas'
import Caja from './pages/Caja'
import { limpiarOperacionesPendientesCaja } from './services/caja'
import {
  cerrarSesion,
  observarCambiosAutenticacion,
  obtenerAutorizacionActual,
  obtenerSesion,
} from './services/auth'

const RUTA_RECUPERAR_PASSWORD = '/recuperar-password'
const RUTA_RESTABLECER_PASSWORD = '/restablecer-password'
const VISTA_INICIO = 'inicio'
const VISTA_CLIENTES = 'clientes'
const VISTA_CAJA = 'caja'
const VISTA_COTIZACIONES = 'cotizaciones'
const VISTA_INVENTARIO = 'inventario'
const VISTA_PRODUCTOS = 'productos'
const VISTA_REPORTES = 'reportes'
const VISTA_USUARIOS = 'usuarios'
const VISTA_VENTAS = 'ventas'

const PERMISO_POR_VISTA = {
  [VISTA_CAJA]: ['caja.operar', 'caja.ver'],
  [VISTA_CLIENTES]: ['cliente.ver'],
  [VISTA_COTIZACIONES]: ['cotizacion.ver'],
  [VISTA_INVENTARIO]: ['inventario.ver'],
  [VISTA_PRODUCTOS]: ['producto.ver'],
  [VISTA_REPORTES]: ['reporte.ver'],
  [VISTA_USUARIOS]: ['usuario.ver'],
  [VISTA_VENTAS]: ['venta.ver', 'venta.crear'],
}

function normalizarRuta(pathname) {
  const ruta = pathname.replace(/\/+$/, '')
  return ruta || '/'
}

function hayCredencialesRecuperacionEnUrl() {
  const parametrosHash = new URLSearchParams(window.location.hash.slice(1))
  const parametrosBusqueda = new URLSearchParams(window.location.search)

  return (
    parametrosHash.get('type') === 'recovery' ||
    parametrosBusqueda.has('code')
  )
}

function App() {
  const [sesion, setSesion] = useState(null)
  const [autorizacion, setAutorizacion] = useState(null)
  const [comprobandoSesion, setComprobandoSesion] = useState(true)
  const [comprobandoAutorizacion, setComprobandoAutorizacion] = useState(false)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [errorSesion, setErrorSesion] = useState('')
  const [errorAutorizacion, setErrorAutorizacion] = useState('')
  const [vistaActual, setVistaActual] = useState(VISTA_INICIO)
  const [ventaInicialId, setVentaInicialId] = useState(null)
  const [rutaActual, setRutaActual] = useState(() =>
    normalizarRuta(window.location.pathname),
  )
  const [sesionRecuperacionValida, setSesionRecuperacionValida] =
    useState(false)
  const [comprobandoRecuperacion, setComprobandoRecuperacion] = useState(
    () =>
      rutaActual === RUTA_RESTABLECER_PASSWORD &&
      hayCredencialesRecuperacionEnUrl(),
  )
  const solicitudAutorizacionRef = useRef(0)

  const permisos = Array.isArray(autorizacion?.permisos)
    ? autorizacion.permisos
        .map((permiso) => permiso?.codigo)
        .filter((codigo) => typeof codigo === 'string')
    : []
  const tienePermiso = (codigo) => permisos.includes(codigo)

  const refrescarAutorizacion = useCallback(async () => {
    const solicitudId = solicitudAutorizacionRef.current + 1
    solicitudAutorizacionRef.current = solicitudId

    if (!sesion?.access_token) {
      setAutorizacion(null)
      setComprobandoAutorizacion(false)
      return null
    }

    setComprobandoAutorizacion(true)

    try {
      const autorizacionActual = await obtenerAutorizacionActual()

      if (solicitudAutorizacionRef.current !== solicitudId) return null

      const codigos = autorizacionActual.permisos
        .map((permiso) => permiso?.codigo)
        .filter((codigo) => typeof codigo === 'string')

      setAutorizacion(autorizacionActual)
      setErrorAutorizacion('')
      setVistaActual((vista) => {
        const permisosRequeridos = PERMISO_POR_VISTA[vista]

        return permisosRequeridos &&
          !permisosRequeridos.some((codigo) => codigos.includes(codigo))
          ? VISTA_INICIO
          : vista
      })

      return autorizacionActual
    } catch (error) {
      if (solicitudAutorizacionRef.current !== solicitudId) return null

      setAutorizacion(null)
      setVistaActual(VISTA_INICIO)

      if (error?.status === 401) {
        setErrorAutorizacion('Tu sesión ya no es válida.')

        try {
          await cerrarSesion()
        } catch {
          // La sesión local se descarta igualmente al recibir un 401.
        }

        limpiarOperacionesPendientesCaja()
        setSesion(null)
      } else if (error?.status === 403) {
        setErrorAutorizacion(
          'Tu perfil no tiene acceso habilitado en este momento.',
        )
      } else {
        setErrorAutorizacion(
          'No fue posible actualizar los permisos. Intenta nuevamente.',
        )
      }

      return null
    } finally {
      if (solicitudAutorizacionRef.current === solicitudId) {
        setComprobandoAutorizacion(false)
      }
    }
  }, [sesion?.access_token])

  useEffect(() => {
    let componenteActivo = true

    // La suscripción mantiene la interfaz sincronizada con los cambios que
    // Supabase Auth realice sobre la sesión, sin administrar tokens manualmente.
    const dejarDeObservar = observarCambiosAutenticacion((evento, nuevaSesion) => {
      if (!componenteActivo) return

      if (evento === 'PASSWORD_RECOVERY') {
        setSesionRecuperacionValida(Boolean(nuevaSesion))
        setComprobandoRecuperacion(false)
      }

      setSesion(nuevaSesion)

      if (!nuevaSesion) {
        limpiarOperacionesPendientesCaja()
        solicitudAutorizacionRef.current += 1
        setAutorizacion(null)
        setComprobandoAutorizacion(false)
        setVistaActual(VISTA_INICIO)
      }

      setComprobandoSesion(false)
      setErrorSesion('')
    })

    const comprobarSesionInicial = async () => {
      try {
        const sesionActual = await obtenerSesion()

        if (componenteActivo) {
          setSesion(sesionActual)
        }
      } catch {
        if (componenteActivo) {
          setErrorSesion(
            'No fue posible comprobar la sesión. Intenta recargar la página.',
          )
        }
      } finally {
        if (componenteActivo) {
          setComprobandoSesion(false)
        }
      }
    }

    comprobarSesionInicial()

    return () => {
      componenteActivo = false
      dejarDeObservar()
    }
  }, [])

  useEffect(() => {
    if (!sesion?.access_token) return undefined

    const temporizador = window.setTimeout(refrescarAutorizacion, 0)

    return () => window.clearTimeout(temporizador)
  }, [refrescarAutorizacion, sesion?.access_token])

  useEffect(() => {
    if (!sesion?.access_token) return undefined

    let ultimoRefresco = 0
    const refrescarAlRecuperarFoco = () => {
      const ahora = Date.now()

      if (document.visibilityState !== 'visible' || ahora - ultimoRefresco < 1000) {
        return
      }

      ultimoRefresco = ahora
      refrescarAutorizacion()
    }

    window.addEventListener('focus', refrescarAlRecuperarFoco)
    document.addEventListener('visibilitychange', refrescarAlRecuperarFoco)

    return () => {
      window.removeEventListener('focus', refrescarAlRecuperarFoco)
      document.removeEventListener('visibilitychange', refrescarAlRecuperarFoco)
    }
  }, [refrescarAutorizacion, sesion?.access_token])

  useEffect(() => {
    const manejarCambioRuta = () => {
      setRutaActual(normalizarRuta(window.location.pathname))
    }

    window.addEventListener('popstate', manejarCambioRuta)

    return () => window.removeEventListener('popstate', manejarCambioRuta)
  }, [])

  useEffect(() => {
    if (!comprobandoRecuperacion) return undefined

    const temporizador = window.setTimeout(() => {
      setComprobandoRecuperacion(false)
    }, 4000)

    return () => window.clearTimeout(temporizador)
  }, [comprobandoRecuperacion])

  const manejarInicioSesion = (nuevaSesion) => {
    setSesion(nuevaSesion)
    setErrorSesion('')
    setErrorAutorizacion('')
  }

  const reemplazarRuta = (ruta) => {
    window.history.replaceState(null, '', ruta)
    setRutaActual(normalizarRuta(ruta))
  }

  const manejarNuevoEnlace = () => {
    setSesionRecuperacionValida(false)
    setComprobandoRecuperacion(false)
    reemplazarRuta(RUTA_RECUPERAR_PASSWORD)
  }

  const manejarFinRestablecimiento = async () => {
    await cerrarSesion()
    setSesion(null)
    setSesionRecuperacionValida(false)
    reemplazarRuta('/')
  }

  const manejarCierreSesion = async () => {
    if (cerrandoSesion) return

    setCerrandoSesion(true)
    setErrorSesion('')

    try {
      await cerrarSesion()
      limpiarOperacionesPendientesCaja()
      solicitudAutorizacionRef.current += 1
      setSesion(null)
      setAutorizacion(null)
      setVistaActual(VISTA_INICIO)
    } catch {
      setErrorSesion('No fue posible cerrar la sesión. Intenta nuevamente.')
    } finally {
      setCerrandoSesion(false)
    }
  }

  if (comprobandoSesion) {
    return (
      <main className="estado-sesion" aria-live="polite">
        <span className="indicador-carga" aria-hidden="true" />
        <p>Comprobando sesión...</p>
      </main>
    )
  }

  if (rutaActual === RUTA_RESTABLECER_PASSWORD) {
    return (
      <RestablecerPassword
        recuperacionValida={sesionRecuperacionValida}
        comprobandoRecuperacion={comprobandoRecuperacion}
        alSolicitarNuevoEnlace={manejarNuevoEnlace}
        alVolverLogin={manejarFinRestablecimiento}
      />
    )
  }

  if (rutaActual === RUTA_RECUPERAR_PASSWORD) {
    return <RecuperarPassword alVolverLogin={() => reemplazarRuta('/')} />
  }

  if (!sesion) {
    return (
      <Login alIniciarSesion={manejarInicioSesion} />
    )
  }

  return (
    <div className="aplicacion-administrativa">
      <header className="barra-superior">
        <div className="contexto-barra-superior" aria-hidden="true">
          <span>Gestión interna</span>
          <strong>Operaciones E-farm</strong>
        </div>

        <div className="acciones-barra-superior">
          <div className="identidad-usuario">
            <span className="etiqueta-usuario">Usuario actual</span>
            <strong className="nombre-usuario">
              {autorizacion?.perfil?.nombre_completo || 'Cuenta E-farm'}
            </strong>
            {sesion.user?.email && (
              <span className="correo-usuario">{sesion.user.email}</span>
            )}
          </div>

          <button
            className="boton-cerrar-sesion"
            type="button"
            onClick={manejarCierreSesion}
            disabled={cerrandoSesion}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            {cerrandoSesion ? (
              <span className="spinner-cerrar-sesion" aria-hidden="true" />
            ) : (
              <img src={iconoCerrarSesion} alt="" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <aside className="barra-lateral">
        <div className="marca-panel">
          <span className="simbolo-panel" aria-hidden="true">
            <img src={logoEfarm} alt="" />
          </span>
          <span className="nombre-marca-panel">
            <strong>E-farm</strong>
            <small>Sistema administrativo</small>
          </span>
        </div>

        <nav className="navegacion-principal" aria-label="Navegación principal">
          <p className="titulo-navegacion">General</p>
          <ul className="lista-navegacion-principal">
            <li>
              <button
                className={`opcion-navegacion boton-navegacion${
                  vistaActual === VISTA_INICIO
                    ? ' opcion-navegacion-activa'
                    : ''
                }`}
                type="button"
                onClick={() => setVistaActual(VISTA_INICIO)}
                aria-current={
                  vistaActual === VISTA_INICIO ? 'page' : undefined
                }
              >
                <IconoInterfaz nombre="inicio" className="icono-navegacion" />
                Inicio
              </button>
            </li>
            {(tienePermiso('venta.ver') || tienePermiso('venta.crear')) && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_VENTAS
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => {
                    setVentaInicialId(null)
                    setVistaActual(VISTA_VENTAS)
                  }}
                  aria-current={
                    vistaActual === VISTA_VENTAS ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="ventas" className="icono-navegacion" />
                  Ventas
                </button>
              </li>
            )}
            {(tienePermiso('caja.operar') || tienePermiso('caja.ver')) && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_CAJA
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_CAJA)}
                  aria-current={
                    vistaActual === VISTA_CAJA ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="caja" className="icono-navegacion" />
                  Caja
                </button>
              </li>
            )}
            {tienePermiso('inventario.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_INVENTARIO
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_INVENTARIO)}
                  aria-current={
                    vistaActual === VISTA_INVENTARIO ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="inventario" className="icono-navegacion" />
                  Inventario
                </button>
              </li>
            )}
            {tienePermiso('producto.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_PRODUCTOS
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_PRODUCTOS)}
                  aria-current={
                    vistaActual === VISTA_PRODUCTOS ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="productos" className="icono-navegacion" />
                  Productos
                </button>
              </li>
            )}
            {tienePermiso('cliente.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_CLIENTES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_CLIENTES)}
                  aria-current={
                    vistaActual === VISTA_CLIENTES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="clientes" className="icono-navegacion" />
                  Clientes
                </button>
              </li>
            )}
            {tienePermiso('cotizacion.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_COTIZACIONES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_COTIZACIONES)}
                  aria-current={
                    vistaActual === VISTA_COTIZACIONES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="cotizaciones" className="icono-navegacion" />
                  Cotizaciones
                </button>
              </li>
            )}
            {tienePermiso('reporte.ver') && (
              <li>
                <button
                  className={`opcion-navegacion boton-navegacion${
                    vistaActual === VISTA_REPORTES
                      ? ' opcion-navegacion-activa'
                      : ''
                  }`}
                  type="button"
                  onClick={() => setVistaActual(VISTA_REPORTES)}
                  aria-current={
                    vistaActual === VISTA_REPORTES ? 'page' : undefined
                  }
                >
                  <IconoInterfaz nombre="reportes" className="icono-navegacion" />
                  Reportes
                </button>
              </li>
            )}
            {comprobandoAutorizacion && !autorizacion && (
              <li className="estado-navegacion" aria-live="polite">
                Consultando accesos...
              </li>
            )}
          </ul>

          {tienePermiso('usuario.ver') && (
            <div className="seccion-navegacion-administracion">
              <p className="titulo-navegacion titulo-navegacion-con-icono">
                <IconoInterfaz
                  nombre="administracion"
                  className="icono-titulo-navegacion"
                />
                Administración
              </p>
              <ul className="lista-navegacion-principal">
                <li>
                  <button
                    className={`opcion-navegacion boton-navegacion${
                      vistaActual === VISTA_USUARIOS
                        ? ' opcion-navegacion-activa'
                        : ''
                    }`}
                    type="button"
                    onClick={() => setVistaActual(VISTA_USUARIOS)}
                    aria-current={
                      vistaActual === VISTA_USUARIOS ? 'page' : undefined
                    }
                  >
                    <IconoInterfaz nombre="usuarios" className="icono-navegacion" />
                    Usuarios
                  </button>
                </li>
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="contenido-aplicacion">
        <main className="area-principal">
          <div className="contenido-panel">
            {vistaActual === VISTA_VENTAS ? (
              <Ventas
                key={autorizacion?.perfil?.id ?? 'sin-usuario'}
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                ventaInicialId={ventaInicialId}
                alConsumirVentaInicial={() => setVentaInicialId(null)}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_CAJA ? (
              <Caja
                key={autorizacion?.perfil?.id ?? 'sin-usuario'}
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_CLIENTES ? (
              <Clientes
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_COTIZACIONES ? (
              <Cotizaciones
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
                alAbrirVenta={(ventaId) => {
                  setVentaInicialId(ventaId)
                  setVistaActual(VISTA_VENTAS)
                }}
              />
            ) : vistaActual === VISTA_INVENTARIO ? (
              <Inventario
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_PRODUCTOS ? (
              <Productos
                permisos={permisos}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : vistaActual === VISTA_REPORTES ? (
              <Reportes alRefrescarAutorizacion={refrescarAutorizacion} />
            ) : vistaActual === VISTA_USUARIOS ? (
              <Usuarios
                permisos={permisos}
                usuarioActualId={autorizacion?.perfil?.id ?? null}
                alRefrescarAutorizacion={refrescarAutorizacion}
              />
            ) : (
              <div className="inicio-panel">
                <section
                  className="encabezado-panel inicio-bienvenida"
                  aria-labelledby="titulo-panel"
                >
                  <div>
                    <p className="etiqueta-seccion">Panel administrativo</p>
                    <h1 id="titulo-panel">Resumen de operaciones internas</h1>
                    <p className="descripcion-panel">
                      Gestiona la actividad diaria de E-farm desde un espacio
                      claro, ordenado y conectado con el trabajo del campo.
                    </p>
                  </div>
                  <div className="estado-inicio" aria-label="Estado de la sesión">
                    <span aria-hidden="true" />
                    Sesión activa
                  </div>
                </section>

                {errorSesion && (
                  <p className="mensaje-error-sesion" role="alert">
                    {errorSesion}
                  </p>
                )}

                {errorAutorizacion && (
                  <p className="mensaje-error-sesion" role="alert">
                    {errorAutorizacion}
                  </p>
                )}

                <section className="seccion-accesos-inicio" aria-labelledby="titulo-accesos">
                  <div className="encabezado-accesos-inicio">
                    <div>
                      <p className="etiqueta-seccion">Área de trabajo</p>
                      <h2 id="titulo-accesos">Accesos disponibles</h2>
                    </div>
                    <p>Las opciones se muestran según tus permisos actuales.</p>
                  </div>

                  <div className="cuadricula-accesos-inicio">
                    {(tienePermiso('venta.ver') || tienePermiso('venta.crear')) && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => {
                          setVentaInicialId(null)
                          setVistaActual(VISTA_VENTAS)
                        }}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="ventas" />
                        </span>
                        <span>
                          <strong>Ventas</strong>
                          <small>Atiende el punto de venta y consulta operaciones.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {(tienePermiso('caja.operar') || tienePermiso('caja.ver')) && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_CAJA)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="caja" />
                        </span>
                        <span>
                          <strong>Caja</strong>
                          <small>Abre, consulta y cierra turnos de efectivo.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('inventario.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_INVENTARIO)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="inventario" />
                        </span>
                        <span>
                          <strong>Inventario</strong>
                          <small>Revisa existencias, alertas y movimientos.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('producto.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_PRODUCTOS)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="productos" />
                        </span>
                        <span>
                          <strong>Productos</strong>
                          <small>Consulta variantes, presentaciones y precios.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('cliente.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_CLIENTES)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="clientes" />
                        </span>
                        <span>
                          <strong>Clientes</strong>
                          <small>Administra la información comercial de clientes.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('cotizacion.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_COTIZACIONES)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="cotizaciones" />
                        </span>
                        <span>
                          <strong>Cotizaciones</strong>
                          <small>Prepara y consulta propuestas comerciales.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('reporte.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_REPORTES)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="reportes" />
                        </span>
                        <span>
                          <strong>Reportes</strong>
                          <small>Analiza ventas, productos, inventario y cotizaciones.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}

                    {tienePermiso('usuario.ver') && (
                      <button
                        className="acceso-inicio"
                        type="button"
                        onClick={() => setVistaActual(VISTA_USUARIOS)}
                      >
                        <span className="icono-acceso-inicio" aria-hidden="true">
                          <IconoInterfaz nombre="usuarios" />
                        </span>
                        <span>
                          <strong>Usuarios</strong>
                          <small>Consulta cuentas, roles y estados de acceso.</small>
                        </span>
                        <span className="flecha-acceso-inicio" aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
