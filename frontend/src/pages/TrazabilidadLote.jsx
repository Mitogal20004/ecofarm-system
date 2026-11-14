import { useEffect, useState } from 'react'
import { apiUrl } from '../services/apiConfig'
import './TrazabilidadLote.css'

function TrazabilidadLote({ token }) {
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    fetch(`${apiUrl}/api/trazabilidad/lotes/${encodeURIComponent(token)}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        if (!respuesta.ok) throw new Error(cuerpo?.message || 'QR no válido.')
        return cuerpo
      })
      .then((cuerpo) => { if (activo) setResultado(cuerpo) })
      .catch((errorConsulta) => { if (activo) setError(errorConsulta.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [token])

  if (cargando) return <main className="pagina-trazabilidad"><div className="tarjeta-trazabilidad"><span className="indicador-carga" /><p>Consultando trazabilidad...</p></div></main>
  if (error || !resultado?.lote) return <main className="pagina-trazabilidad"><div className="tarjeta-trazabilidad"><span className="sello-trazabilidad sello-error">QR no disponible</span><h1>No fue posible consultar este lote</h1><p>{error || 'El enlace puede estar vencido o inactivo.'}</p></div></main>

  const { lote, inspecciones = [] } = resultado
  return <main className="pagina-trazabilidad"><div className="cabecera-trazabilidad"><span className="eyebrow-trazabilidad">E-farm · trazabilidad agrícola</span><h1>{lote.codigo}</h1><p>Información pública del lote</p></div><section className="tarjeta-trazabilidad"><div className="sello-trazabilidad sello-activo">{lote.estado}</div><div className="datos-trazabilidad"><div><span>Variedad</span><strong>{lote.variedad}</strong></div><div><span>Color</span><strong>{lote.color}</strong></div><div><span>Longitud</span><strong>{lote.longitud_cm} cm</strong></div><div><span>Origen</span><strong>{lote.origen}</strong></div><div><span>Fecha de origen</span><strong>{lote.fecha_origen}</strong></div><div><span>Calidad</span><strong>{lote.calidad || 'En evaluación'}</strong></div></div><div className="historial-trazabilidad"><h2>Inspecciones de calidad</h2>{inspecciones.length === 0 ? <p>No hay inspecciones registradas.</p> : <ul>{inspecciones.map((inspeccion, indice) => <li key={`${inspeccion.fecha_inspeccion}-${indice}`}><strong>{inspeccion.resultado}</strong><span>{inspeccion.observaciones || 'Sin observaciones.'}</span></li>)}</ul>}</div></section></main>
}

export default TrazabilidadLote
