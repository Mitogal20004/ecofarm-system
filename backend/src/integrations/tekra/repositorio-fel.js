import { ErrorValidacionFel } from './errores.js'

const CAMPOS_FACTURA = [
  'id',
  'venta_id',
  'estado',
  'tipo_documento',
  'nit_receptor_snapshot',
  'nombre_receptor_snapshot',
  'direccion_receptor_snapshot',
  'total_snapshot',
  'xml_solicitud',
  'requiere_conciliacion',
].join(',')

const CAMPOS_VENTA = [
  'id',
  'numero',
  'cliente_id',
  'estado',
  'comprador_nombre',
  'comprador_nit',
  'comprador_direccion',
  'total',
  'fecha_confirmacion',
].join(',')

const CAMPOS_DETALLE = [
  'id',
  'venta_id',
  'numero_linea',
  'producto_codigo_snapshot',
  'producto_nombre_snapshot',
  'producto_descripcion_snapshot',
  'codigo_sku_snapshot',
  'color_snapshot',
  'longitud_cm_snapshot',
  'clasificacion_snapshot',
  'presentacion_codigo_snapshot',
  'presentacion_nombre_snapshot',
  'cantidad_presentaciones',
  'precio_unitario',
  'subtotal',
].join(',')

const exigirConsulta = async (consulta, recurso) => {
  const { data, error } = await consulta

  if (error) {
    throw new ErrorValidacionFel(
      `No fue posible cargar ${recurso} desde la base de datos.`,
    )
  }

  return data
}

export function crearRepositorioFelPersistido(clienteSupabase) {
  if (!clienteSupabase || typeof clienteSupabase.from !== 'function') {
    throw new TypeError('Se requiere un cliente Supabase de backend.')
  }

  return Object.freeze({
    async obtenerFacturaParaPreparacion(facturaId) {
      const factura = await exigirConsulta(
        clienteSupabase
          .from('facturas_fel')
          .select(CAMPOS_FACTURA)
          .eq('id', facturaId)
          .maybeSingle(),
        'la Factura FEL',
      )

      if (!factura) {
        throw new ErrorValidacionFel('La Factura FEL persistida no existe.')
      }

      const [venta, detalles] = await Promise.all([
        exigirConsulta(
          clienteSupabase
            .from('ventas')
            .select(CAMPOS_VENTA)
            .eq('id', factura.venta_id)
            .maybeSingle(),
          'la Venta',
        ),
        exigirConsulta(
          clienteSupabase
            .from('venta_detalles')
            .select(CAMPOS_DETALLE)
            .eq('venta_id', factura.venta_id)
            .order('numero_linea', { ascending: true }),
          'los detalles de la Venta',
        ),
      ])

      if (!venta || !Array.isArray(detalles) || detalles.length === 0) {
        throw new ErrorValidacionFel(
          'La Venta persistida no contiene la información necesaria.',
        )
      }

      return { factura, venta, detalles }
    },
  })
}
