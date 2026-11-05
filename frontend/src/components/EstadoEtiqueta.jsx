import { Check, X, TriangleAlert, Minus, Info } from 'lucide-react'
import './EstadoEtiqueta.css'

// El estado se comunica con icono, texto y color, nunca solo con color.
const ICONO_ESTADO = {
  positivo: Check,
  peligro: X,
  advertencia: TriangleAlert,
  neutro: Minus,
  informativo: Info,
}

function EstadoEtiqueta({ children, tono = 'neutro', className = '' }) {
  const Icono = ICONO_ESTADO[tono] ?? Minus

  return (
    <span
      className={`estado-etiqueta estado-etiqueta-${tono}${
        className ? ` ${className}` : ''
      }`}
    >
      <Icono
        className="estado-etiqueta-icono"
        size={13}
        strokeWidth={2.3}
        aria-hidden="true"
        focusable="false"
      />
      {children}
    </span>
  )
}

export default EstadoEtiqueta
