const TRAZOS_ICONOS = {
  inicio: (
    <>
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.6V21h13V9.6" />
      <path d="M9.5 21v-6.5h5V21" />
    </>
  ),
  ventas: (
    <>
      <path d="M3 4h2l2.2 10.2h10.6l2-7.2H6" />
      <circle cx="9" cy="19" r="1.25" />
      <circle cx="17" cy="19" r="1.25" />
    </>
  ),
  inventario: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
      <path d="m8 5 8 4" />
    </>
  ),
  productos: (
    <>
      <path d="M12 21V10" />
      <path d="M12 14c-4.5 0-7-2.4-7-6 4.5 0 7 2.4 7 6Z" />
      <path d="M12 11c0-4.4 2.4-7 6-7 0 4.4-2.4 7-6 7Z" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" />
      <path d="M16 5.4a3 3 0 0 1 0 5.2" />
      <path d="M16.5 14.2c2.4.5 3.7 2.4 4 5.8" />
    </>
  ),
  cotizaciones: (
    <>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v5h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  reportes: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  administracion: (
    <>
      <path d="M12 3 5 6v5c0 4.6 2.6 8 7 10 4.4-2 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.4-4 2.2-6 5.5-6 1.5 0 2.7.4 3.6 1.2" />
      <circle cx="17.5" cy="16.5" r="2.5" />
      <path d="M17.5 12.5v1.5M17.5 19v1.5M13.5 16.5H15M20 16.5h1.5" />
    </>
  ),
  paleta: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18h1.3a1.8 1.8 0 0 0 1.2-3.1 1.8 1.8 0 0 1 1.2-3.1H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z" />
      <circle cx="7.5" cy="10" r=".7" />
      <circle cx="10" cy="6.8" r=".7" />
      <circle cx="14" cy="6.8" r=".7" />
      <circle cx="17" cy="10" r=".7" />
    </>
  ),
  estrella: (
    <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
  ),
  capas: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  manojos: (
    <>
      <path d="M8 21c4-5 5-10 4-17" />
      <path d="M12 10c-4 0-6-2-6-5 4 0 6 2 6 5ZM12 14c4 0 6-2 6-5-4 0-6 2-6 5Z" />
      <path d="M6 18h7" />
    </>
  ),
  disponible: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
      <path d="m8.5 15.5 2 2 4-4" />
    </>
  ),
  advertencia: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.5v.1" />
    </>
  ),
  agotado: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
      <path d="m8.5 14.5 7 5M15.5 14.5l-7 5" />
    </>
  ),
}

function IconoInterfaz({ nombre, className = '' }) {
  const trazos = TRAZOS_ICONOS[nombre]

  if (!trazos) return null

  return (
    <svg
      className={`icono-interfaz${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {trazos}
    </svg>
  )
}

export default IconoInterfaz
