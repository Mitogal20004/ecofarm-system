import { useCallback, useEffect, useState } from 'react'
import { Power, Trash2, UserPlus } from 'lucide-react'
import { actualizarProveedor, crearProveedor, eliminarProveedor, listarProveedoresOperativos } from '../services/operaciones'
import './Proveedores.css'

const FORMULARIO_INICIAL = {
  nombre: '',
  nit: '',
  contacto: '',
  telefono: '',
  correo: '',
}

function Proveedores({ permisos, alRefrescarAutorizacion }) {
  const puedeAdministrar = permisos.includes('compra.administrar')
  const [proveedores, setProveedores] = useState([])
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

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
    setFormulario((actual) => ({ ...actual, [name]: value }))
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      await crearProveedor({
        ...formulario,
        nit: formulario.nit.trim() || null,
        contacto: formulario.contacto.trim() || null,
        telefono: formulario.telefono.trim() || null,
        correo: formulario.correo.trim().toLowerCase() || null,
      })
      setFormulario(FORMULARIO_INICIAL)
      setMensaje('Proveedor registrado correctamente.')
      await cargar()
    } catch (errorGuardado) {
      setError(errorGuardado?.status === 409
        ? 'Ya existe un proveedor con ese NIT.'
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
            <label>NIT<input name="nit" value={formulario.nit} onChange={cambiarCampo} maxLength="30" placeholder="1234567-8" /></label>
            <label>Persona de contacto<input name="contacto" value={formulario.contacto} onChange={cambiarCampo} maxLength="150" placeholder="Ana López" /></label>
            <label>Teléfono<input name="telefono" value={formulario.telefono} onChange={cambiarCampo} maxLength="30" placeholder="5555-5555" /></label>
            <label>Correo electrónico<input name="correo" type="email" value={formulario.correo} onChange={cambiarCampo} maxLength="254" placeholder="contacto@proveedor.com" /></label>
            <div className="acciones-proveedores"><button className="boton-principal-proveedores" type="submit" disabled={guardando}><UserPlus size={16} strokeWidth={2} aria-hidden="true" />{guardando ? 'Guardando...' : 'Registrar proveedor'}</button></div>
          </form>
        </section>
      )}

      <section className="panel-proveedores">
        <div className="titulo-panel-proveedores"><div><span className="eyebrow-proveedores">Directorio</span><h2>Proveedores registrados</h2></div><button className="boton-secundario-proveedores" type="button" onClick={() => { setCargando(true); cargar() }}>Actualizar</button></div>
        {cargando ? <p className="estado-vacio-proveedores">Cargando proveedores...</p> : proveedores.length === 0 ? <p className="estado-vacio-proveedores">Todavía no hay proveedores registrados.</p> : <div className="tabla-proveedores-scroll"><table className="tabla-proveedores"><thead><tr><th>Proveedor</th><th>NIT</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{proveedores.map((proveedor) => <tr key={proveedor.id}><td><strong>{proveedor.nombre}</strong></td><td>{proveedor.nit || '—'}</td><td>{proveedor.contacto || '—'}</td><td>{proveedor.telefono || '—'}</td><td>{proveedor.correo || '—'}</td><td><span className={proveedor.activo ? 'estado-proveedor-activo' : 'estado-proveedor-inactivo'}>{proveedor.activo ? 'Activo' : 'Inactivo'}</span></td><td><button className="boton-estado-proveedor" type="button" onClick={() => cambiarEstado(proveedor)} aria-label={`${proveedor.activo ? 'Desactivar' : 'Activar'} proveedor ${proveedor.nombre}`} title={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}><Power size={16} strokeWidth={2} aria-hidden="true" /></button><button className="boton-eliminar-proveedor" type="button" onClick={() => borrar(proveedor)} aria-label={`Eliminar proveedor ${proveedor.nombre}`} title="Eliminar proveedor"><Trash2 size={16} strokeWidth={2} aria-hidden="true" /></button></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  )
}

export default Proveedores
