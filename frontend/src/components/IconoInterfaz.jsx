import {
  House,
  ShoppingCart,
  Wallet,
  Boxes,
  Sprout,
  UsersRound,
  ClipboardList,
  ChartColumn,
  ShieldCheck,
  Settings,
  Palette,
  Star,
  Layers,
  Flower2,
  PackageCheck,
  TriangleAlert,
  PackageX,
  Eye,
  CircleX,
  Receipt,
  FileText,
  Handshake,
} from 'lucide-react'

// Un solo catálogo de iconos para todas las pantallas administrativas.
// Mantiene los nombres usados por los módulos sin afectar su lógica.
const ICONOS = {
  inicio: House,
  ventas: ShoppingCart,
  caja: Wallet,
  inventario: Boxes,
  productos: Sprout,
  clientes: UsersRound,
  cotizaciones: ClipboardList,
  reportes: ChartColumn,
  administracion: ShieldCheck,
  usuarios: Settings,
  paleta: Palette,
  estrella: Star,
  capas: Layers,
  manojos: Flower2,
  disponible: PackageCheck,
  advertencia: TriangleAlert,
  agotado: PackageX,
  ver: Eye,
  anular: CircleX,
  recibo: Receipt,
  factura: FileText,
  proveedores: Handshake,
}

function IconoInterfaz({ nombre, className = '' }) {
  const Icono = ICONOS[nombre]
  if (!Icono) return null

  return (
    <Icono
      className={`icono-interfaz${className ? ` ${className}` : ''}`}
      size={18}
      strokeWidth={1.75}
      absoluteStrokeWidth
      aria-hidden="true"
      focusable="false"
    />
  )
}

export default IconoInterfaz
