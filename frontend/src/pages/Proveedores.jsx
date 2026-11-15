import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Power, RefreshCw, Search, Trash2, UserPlus, X } from 'lucide-react'
import { actualizarProveedor, crearProveedor, editarProveedor, eliminarProveedor, listarProveedoresOperativos } from '../services/operaciones'
import { obtenerUrlBandera, PAISES_TELEFONO, separarTelefono } from '../utils/telefono'
import './Proveedores.css'

const FORMULARIO_INICIAL = {
  nombre: '',
  nit: '',
  contacto: '',
  telefono: '',
  correo: '',
}

function SelectorPais({ value, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const referencia = useRef(null)
  const paisSeleccionado = PAISES_TELEFONO.find((pais) => pais.codigo === value) ?? PAISES_TELEFONO[0]

  useEffect(() => {
    const cerrar = (evento) => {
      if (!referencia.current?.contains(evento.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  return (
    <div className="selector-pais-proveedores" ref={referencia}>
      <button className="disparador-pais-proveedores" type="button" aria-label="País del teléfono" aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto((actual) => !actual)}>
        <img src={obtenerUrlBandera(paisSeleccionado.iso)} alt="" /><span>{paisSeleccionado.codigo}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {abierto && <div className="opciones-pais-proveedores" role="listbox" aria-label="País del teléfono">
        {PAISES_TELEFONO.map((pais) => <button className="opcion-pais-proveedores" type="button" role="option" aria-selected={pais.codigo === value} key={pais.codigo} onClick={() => { onChange(pais.codigo); setAbierto(false) }}><img src={obtenerUrlBandera(pais.iso)} alt="" /><span>{pais.nombre}</span><strong>{pais.codigo}</strong></button>)}
      </div>}
    </div>
  )
}

function Proveedores({ permisos, alRefrescarAutorizacion }) {
  const puedeAdministrar = permisos.includes('compra.administrar')
  const [proveedores, setProveedores] = useState([])
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [paisTelefono, setPaisTelefono] = useState(PAISES_TELEFONO[0].codigo)
  const [errores, setErrores] = useState({})
  const [proveedorEditando, setProveedorEditando] = useState(null)
  const [formularioEdicion, setFormularioEdicion] = useState(FORMULARIO_INICIAL)
  const [paisEdicion, setPaisEdicion] = useState(PAISES_TELEFONO[0].codigo)
  const [erroresEdicion, setErroresEdicion] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const elementosPorPagina = 10

  useEffect(() => {
    const temporizador = window.setTimeout(() => setBusquedaAplicada(busqueda.trim().toLowerCase()), 1000)
    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const cargar = useCallback(async () => {
    try {
      setError('')
      setProveedores(await listarProveedoresOperativos())
    } catch (errorCarga) {
      setError(errorCarga?.status === 403
        ? 'Tu perfil no tiene permiso para consultar proveedores.'
        : 'No fue posible cargar los proveedores.')
      if ([401, 403].includes(errorCarga?.status)) alRefrescarAutorizacion?.()
    } finally {
      setCargando(false)
    }
  }, [alRefrescarAutorizacion])

  useEffect(() => {
    const temporizador = window.setTimeout(() => cargar(), 0)
    return () => window.clearTimeout(temporizador)
  }, [cargar])

  const cambiarCampo = (evento) => {
    const { name, value } = evento.target
    const valorLimpio = name === 'nit'
      ? value.replace(/[^\d-]/g, '')
      : name === 'telefono'
        ? value.replace(/\D/g, '').slice(0, 15)
        : name === 'contacto'
          ? value.replace(/[^\p{L}\s.'-]/gu, '')
        : value
    setFormulario((actual) => ({ ...actual, [name]: valorLimpio }))
    if (name === 'nit' || name === 'correo' || name === 'telefono') {
      setErrores((actual) => ({ ...actual, [name]: validarCampo(name, valorLimpio) }))
    }
  }

  const validarCampo = (nombre, valor) => {
    if (nombre === 'nit') {
      if (!valor.trim()) return ''
      if (!/^\d+(?:-\d)?$/.test(valor) || valor.replace(/\D/g, '').length < 7 || valor.replace(/\D/g, '').length > 9) return 'El NIT debe contener entre 7 y 9 dígitos.'
    }
    if (nombre === 'correo' && valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return 'Ingresa un correo electrónico válido.'
    if (nombre === 'telefono' && valor) {
      const digitos = valor.replace(/\D/g, '')
      if (digitos.length < 7) return 'El teléfono debe tener mínimo 7 dígitos.'
      if (digitos.length > 15) return 'El teléfono no puede superar 15 dígitos.'
    }
    return ''
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    const erroresFormulario = {
      nit: validarCampo('nit', formulario.nit),
      correo: validarCampo('correo', formulario.correo),
      telefono: validarCampo('telefono', formulario.telefono),
    }
    setErrores(erroresFormulario)
    if (Object.values(erroresFormulario).some(Boolean)) return
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      await crearProveedor({
        ...formulario,
        nit: formulario.nit.trim() || null,
        contacto: formulario.contacto.trim() || null,
        telefono: formulario.telefono.trim() ? `${paisTelefono}${formulario.telefono.replace(/\D/g, '')}` : null,
        correo: formulario.correo.trim().toLowerCase() || null,
      })
      setFormulario(FORMULARIO_INICIAL)
      setPaisTelefono(PAISES_TELEFONO[0].codigo)
      setErrores({})
      setMensaje('Proveedor registrado correctamente.')
      await cargar()
    } catch (errorGuardado) {
      setError(errorGuardado?.status === 409
        ? errorGuardado.message
        : 'No fue posible registrar el proveedor.')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (proveedor) => {
    if (!window.confirm(`¿Eliminar el proveedor "${proveedor.nombre}"?`)) return
    setError('')
    setMensaje('')
    try {
      await eliminarProveedor(proveedor.id)
      setMensaje('Proveedor eliminado correctamente.')
      await cargar()
    } catch (errorEliminacion) {
      setError(errorEliminacion?.status === 400
        ? 'No se puede eliminar porque el proveedor está relacionado con compras o lotes.'
        : 'No fue posible eliminar el proveedor.')
    }
  }

  const cambiarEstado = async (proveedor) => {
    try {
      await actualizarProveedor(proveedor.id, !proveedor.activo)
      setMensaje(`Proveedor ${proveedor.activo ? 'desactivado' : 'activado'} correctamente.`)
      await cargar()
    } catch {
      setError('No fue posible actualizar el estado del proveedor.')
    }
  }

  const abrirEdicion = (proveedor) => {
    const telefono = separarTelefono(proveedor.telefono)
    setProveedorEditando(proveedor)
    setFormularioEdicion({
      nombre: proveedor.nombre || '',
      nit: proveedor.nit || '',
      contacto: proveedor.contacto || '',
      telefono: telefono.local,
      correo: proveedor.correo || '',
    })
    setPaisEdicion(telefono.codigo)
    setErroresEdicion({})
    setError('')
  }

  const cerrarEdicion = () => {
    setProveedorEditando(null)
    setErroresEdicion({})
  }

  const cambiarCampoEdicion = (evento) => {
    const { name, value } = evento.target
    const valorLimpio = name === 'nit'
      ? value.replace(/[^\d-]/g, '')
      : name === 'telefono'
        ? value.replace(/\D/g, '').slice(0, 15)
        : name === 'contacto'
          ? value.replace(/[^\p{L}\s.'-]/gu, '')
          : value
    setFormularioEdicion((actual) => ({ ...actual, [name]: valorLimpio }))
    if (['nit', 'correo', 'telefono'].includes(name)) setErroresEdicion((actual) => ({ ...actual, [name]: validarCampo(name, valorLimpio) }))
  }

  const guardarEdicion = async (evento) => {
    evento.preventDefault()
    const erroresFormulario = {
      nit: validarCampo('nit', formularioEdicion.nit),
      correo: validarCampo('correo', formularioEdicion.correo),
      telefono: validarCampo('telefono', formularioEdicion.telefono),
    }
    if (!formularioEdicion.nombre.trim()) erroresFormulario.nombre = 'El nombre comercial es obligatorio.'
    setErroresEdicion(erroresFormulario)
    if (Object.values(erroresFormulario).some(Boolean)) return
    setGuardando(true)
    setError('')
    try {
      await editarProveedor(proveedorEditando.id, {
        nombre: formularioEdicion.nombre.trim(),
        nit: formularioEdicion.nit.trim() || null,
        contacto: formularioEdicion.contacto.trim() || null,
        telefono: formularioEdicion.telefono.trim() ? `${paisEdicion}${formularioEdicion.telefono.replace(/\D/g, '')}` : null,
        correo: formularioEdicion.correo.trim().toLowerCase() || null,
      })
      cerrarEdicion()
      setMensaje('Proveedor actualizado correctamente.')
      await cargar()
    } catch (errorEdicionApi) {
      setErroresEdicion((actual) => ({ ...actual, api: errorEdicionApi?.message || 'No fue posible actualizar el proveedor.' }))
    } finally {
      setGuardando(false)
    }
  }

  const proveedoresFiltrados = useMemo(() => {
    if (!busquedaAplicada) return proveedores
    return proveedores.filter((proveedor) => [proveedor.nombre, proveedor.nit, proveedor.contacto, proveedor.telefono, proveedor.correo].some((valor) => String(valor ?? '').toLowerCase().includes(busquedaAplicada)))
  }, [busquedaAplicada, proveedores])
  const totalPaginas = Math.max(1, Math.ceil(proveedoresFiltrados.length / elementosPorPagina))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const proveedoresVisibles = proveedoresFiltrados.slice((paginaSegura - 1) * elementosPorPagina, paginaSegura * elementosPorPagina)

  return (
    <div className="pagina-proveedores">
      <header className="encabezado-proveedores">
        <div>
          <span className="eyebrow-proveedores">Compras · abastecimiento</span>
          <h1>Proveedores</h1>
          <p>Administra los proveedores que alimentan los lotes de compra.</p>
        </div>
        <div className="resumen-proveedores"><strong>{proveedores.length}</strong><span>proveedores</span></div>
      </header>

      {error && <div className="alerta-proveedores alerta-proveedores-error">{error}</div>}
      {mensaje && <div className="alerta-proveedores alerta-proveedores-exito">{mensaje}</div>}

      {puedeAdministrar && (
        <section className="panel-proveedores">
          <div className="titulo-panel-proveedores"><div><span className="eyebrow-proveedores">Nuevo registro</span><h2>Agregar proveedor</h2></div><span>Los campos de contacto son opcionales.</span></div>
          <form className="formulario-proveedores" onSubmit={enviar}>
            <label><span>Nombre comercial <span className="campo-obligatorio-proveedores" aria-hidden="true">*</span></span><input name="nombre" value={formulario.nombre} onChange={cambiarCampo} required maxLength="200" placeholder="Flores del valle" /></label>
             <label>NIT<input name="nit" value={formulario.nit} onChange={cambiarCampo} maxLength="10" inputMode="numeric" placeholder="1234567-8" aria-invalid={Boolean(errores.nit)} />{errores.nit && <small className="error-campo-proveedores">{errores.nit}</small>}</label>
             <label>Persona de contacto<input name="contacto" value={formulario.contacto} onChange={cambiarCampo} maxLength="150" inputMode="text" placeholder="Ana López" /></label>
             <label>Teléfono<div className="telefono-proveedor-control"><SelectorPais value={paisTelefono} onChange={setPaisTelefono} /><input name="telefono" value={formulario.telefono} onChange={cambiarCampo} maxLength="15" inputMode="numeric" pattern="[0-9]*" placeholder="5555555" aria-invalid={Boolean(errores.telefono)} /></div>{errores.telefono && <small className="error-campo-proveedores">{errores.telefono}</small>}</label>
            <label>Correo electrónico<input name="correo" type="email" value={formulario.correo} onChange={cambiarCampo} maxLength="254" placeholder="contacto@proveedor.com" aria-invalid={Boolean(errores.correo)} />{errores.correo && <small className="error-campo-proveedores">{errores.correo}</small>}</label>
            <div className="acciones-proveedores"><button className="boton-principal-proveedores" type="submit" disabled={guardando}><UserPlus size={16} strokeWidth={2} aria-hidden="true" />{guardando ? 'Guardando...' : 'Registrar proveedor'}</button></div>
          </form>
        </section>
      )}

      <section className="panel-proveedores">
           <div className="titulo-panel-proveedores"><div><span className="eyebrow-proveedores">Directorio</span><h2>Proveedores registrados</h2></div><button className="boton-secundario-proveedores" type="button" onClick={() => { setCargando(true); cargar() }}><RefreshCw size={15} aria-hidden="true" />Actualizar</button></div>
           <div className="barra-listado-proveedores"><label className="busqueda-proveedores"><Search size={16} aria-hidden="true" /><span className="texto-solo-lectores">Buscar proveedores</span><input value={busqueda} onChange={(evento) => { setBusqueda(evento.target.value); setPagina(1) }} placeholder="Buscar por nombre, NIT o correo" /></label><span>{proveedoresFiltrados.length} resultados</span></div>
          {cargando ? <p className="estado-vacio-proveedores">Cargando proveedores...</p> : proveedoresFiltrados.length === 0 ? <p className="estado-vacio-proveedores">{proveedores.length ? 'No hay proveedores que coincidan con la búsqueda.' : 'Todavía no hay proveedores registrados.'}</p> : <><div className="tabla-proveedores-scroll"><table className="tabla-proveedores"><thead><tr><th>Proveedor</th><th>NIT</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{proveedoresVisibles.map((proveedor) => <tr key={proveedor.id}><td><strong>{proveedor.nombre}</strong></td><td>{proveedor.nit || '—'}</td><td>{proveedor.contacto || '—'}</td><td>{proveedor.telefono || '—'}</td><td>{proveedor.correo || '—'}</td><td><span className={proveedor.activo ? 'estado-proveedor-activo' : 'estado-proveedor-inactivo'}>{proveedor.activo ? 'Activo' : 'Inactivo'}</span></td><td><button className="boton-editar-proveedor" type="button" onClick={() => abrirEdicion(proveedor)} aria-label={`Editar proveedor ${proveedor.nombre}`} title="Editar proveedor"><Pencil size={16} strokeWidth={2} aria-hidden="true" /></button><button className="boton-estado-proveedor" type="button" onClick={() => cambiarEstado(proveedor)} aria-label={`${proveedor.activo ? 'Desactivar' : 'Activar'} proveedor ${proveedor.nombre}`} title={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}><Power size={16} strokeWidth={2} aria-hidden="true" /></button><button className="boton-eliminar-proveedor" type="button" onClick={() => borrar(proveedor)} aria-label={`Eliminar proveedor ${proveedor.nombre}`} title="Eliminar proveedor"><Trash2 size={16} strokeWidth={2} aria-hidden="true" /></button></td></tr>)}</tbody></table></div><div className="paginacion-proveedores"><button type="button" className="boton-paginacion-proveedores" onClick={() => setPagina((actual) => actual - 1)} disabled={paginaSegura === 1} aria-label="Página anterior"><ChevronLeft size={17} /></button><span>Página {paginaSegura} de {totalPaginas}</span><button type="button" className="boton-paginacion-proveedores" onClick={() => setPagina((actual) => actual + 1)} disabled={paginaSegura === totalPaginas} aria-label="Página siguiente"><ChevronRight size={17} /></button></div></>}
       </section>
       {proveedorEditando && <div className="modal-proveedor-fondo" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) cerrarEdicion() }}><section className="modal-proveedor" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-proveedor"><div className="encabezado-modal-proveedor"><div><span className="eyebrow-proveedores">Directorio</span><h2 id="titulo-editar-proveedor">Editar proveedor</h2></div><button className="boton-cerrar-modal-proveedor" type="button" onClick={cerrarEdicion} aria-label="Cerrar edición"><X size={18} /></button></div>{erroresEdicion.api && <div className="alerta-proveedores alerta-proveedores-error">{erroresEdicion.api}</div>}<form className="formulario-proveedores formulario-edicion-proveedor" onSubmit={guardarEdicion}><label><span>Nombre comercial <span className="campo-obligatorio-proveedores" aria-hidden="true">*</span></span><input name="nombre" value={formularioEdicion.nombre} onChange={cambiarCampoEdicion} required maxLength="200" aria-invalid={Boolean(erroresEdicion.nombre)} />{erroresEdicion.nombre && <small className="error-campo-proveedores">{erroresEdicion.nombre}</small>}</label><label>NIT<input name="nit" value={formularioEdicion.nit} onChange={cambiarCampoEdicion} maxLength="10" inputMode="numeric" aria-invalid={Boolean(erroresEdicion.nit)} />{erroresEdicion.nit && <small className="error-campo-proveedores">{erroresEdicion.nit}</small>}</label><label>Persona de contacto<input name="contacto" value={formularioEdicion.contacto} onChange={cambiarCampoEdicion} maxLength="150" /></label><label>Teléfono<div className="telefono-proveedor-control"><SelectorPais value={paisEdicion} onChange={setPaisEdicion} /><input name="telefono" value={formularioEdicion.telefono} onChange={cambiarCampoEdicion} maxLength="15" inputMode="numeric" pattern="[0-9]*" aria-invalid={Boolean(erroresEdicion.telefono)} /></div>{erroresEdicion.telefono && <small className="error-campo-proveedores">{erroresEdicion.telefono}</small>}</label><label>Correo electrónico<input name="correo" type="email" value={formularioEdicion.correo} onChange={cambiarCampoEdicion} maxLength="254" aria-invalid={Boolean(erroresEdicion.correo)} />{erroresEdicion.correo && <small className="error-campo-proveedores">{erroresEdicion.correo}</small>}</label><div className="acciones-modal-proveedor"><button className="boton-secundario-proveedores" type="button" onClick={cerrarEdicion}>Cancelar</button><button className="boton-principal-proveedores" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button></div></form></section></div>}
      </div>
  )
}

export default Proveedores
