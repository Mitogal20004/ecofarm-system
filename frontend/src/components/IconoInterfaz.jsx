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
      <path d="M6 3.5h12v17H6z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h3" />
      <path d="m13.5 17 1.5 1.5 3-3" />
    </>
  ),
  caja: (
    <>
      <path d="M4 8h16v12H4z" />
      <path d="M6 8V5h12v3" />
      <path d="M4 12h16" />
      <path d="M8 16h5" />
      <path d="M16.5 15.5h.01" />
    </>
  ),
  inventario: (
    <>
      <rect x="3.5" y="4" width="7" height="7" rx=".7" />
      <rect x="13.5" y="4" width="7" height="7" rx=".7" />
      <rect x="3.5" y="14" width="7" height="7" rx=".7" />
      <rect x="13.5" y="14" width="7" height="7" rx=".7" />
      <path d="M7 7.5h.01M17 7.5h.01M7 17.5h.01M17 17.5h.01" />
    </>
  ),
  productos: (
    <>
      <path d="M5 20h14M8 20v-7M16 20v-7M12 20V6" />
      <path d="M12 11C8 11 6 9 6 5c4 0 6 2 6 6Z" />
      <path d="M12 8c0-3 2-5 6-5 0 3-2 5-6 5Z" />
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
      strokeWidth="1.6"
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
