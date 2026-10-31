import './EstadoEtiqueta.css'

function EstadoEtiqueta({ children, tono = 'neutro', className = '' }) {
  return (
    <span
      className={`estado-etiqueta estado-etiqueta-${tono}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </span>
  )
}

export default EstadoEtiqueta
