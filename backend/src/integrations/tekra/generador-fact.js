import {
  compararDecimales,
  DECIMAL_CERO,
  decimalExacto,
  formatearDecimal,
  multiplicarDecimalPorEntero,
  sumarDecimales,
} from './decimal-exacto.js'
import { validarConfiguracionFiscalFel } from './configuracion.js'
import { ErrorConfiguracionTekra, ErrorValidacionFel } from './errores.js'
import { escaparAtributoXml, escaparTextoXml } from './xml-seguro.js'

const NAMESPACE_DTE = 'http://www.sat.gob.gt/dte/fel/0.2.0'
const NAMESPACES_DOCUMENTO = {
  cfc: 'http://www.sat.gob.gt/dte/fel/CompCambiaria/0.1.0',
  cex: 'http://www.sat.gob.gt/face2/ComplementoExportaciones/0.1.0',
  cfe: 'http://www.sat.gob.gt/face2/ComplementoFacturaEspecial/0.1.0',
  cno: 'http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
}
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const exigirTexto = (valor, campo) => {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErrorValidacionFel(`${campo} es obligatorio.`)
  }
  return valor.trim()
}

const exigirEnteroEnRango = (valor, campo, maximo) => {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > maximo) {
    throw new ErrorValidacionFel(
      `${campo} debe ser un entero entre 1 y ${maximo}.`,
    )
  }
  return valor
}

const exigirSnapshotTexto = (valor, campo) => {
  const texto = exigirTexto(valor, campo)

  if (texto !== valor) {
    throw new ErrorValidacionFel(`${campo} no está normalizado.`)
  }

  return texto
}

const normalizarNit = (valor) => valor.replace(/[\s-]+/g, '').toUpperCase()

const validarDireccion = (direccion, campo) => ({
  direccion: exigirTexto(direccion?.direccion, `${campo}.direccion`),
  codigoPostal: exigirTexto(
    direccion?.codigoPostal,
    `${campo}.codigoPostal`,
  ),
  municipio: exigirTexto(direccion?.municipio, `${campo}.municipio`),
  departamento: exigirTexto(
    direccion?.departamento,
    `${campo}.departamento`,
  ),
  pais: exigirTexto(direccion?.pais, `${campo}.pais`),
})

const xmlDireccion = (nombre, direccion) => `
          <dte:${nombre}>
            <dte:Direccion>${escaparTextoXml(direccion.direccion)}</dte:Direccion>
            <dte:CodigoPostal>${escaparTextoXml(direccion.codigoPostal)}</dte:CodigoPostal>
            <dte:Municipio>${escaparTextoXml(direccion.municipio)}</dte:Municipio>
            <dte:Departamento>${escaparTextoXml(direccion.departamento)}</dte:Departamento>
            <dte:Pais>${escaparTextoXml(direccion.pais)}</dte:Pais>
          </dte:${nombre}>`

export const validarDatosPersistidosFact = (datos) => {
  const { factura, venta, detalles } = datos ?? {}

  if (
    !factura ||
    !venta ||
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    detalles.length > 100
  ) {
    throw new ErrorValidacionFel('Los datos persistidos de la Venta están incompletos.')
  }

  if (
    !PATRON_UUID.test(factura.id) ||
    !PATRON_UUID.test(venta.id) ||
    factura.venta_id !== venta.id
  ) {
    throw new ErrorValidacionFel('La Factura no corresponde con la Venta persistida.')
  }

  if (
    factura.tipo_documento !== 'FACT' ||
    !['pendiente', 'error'].includes(factura.estado) ||
    venta.estado !== 'confirmada'
  ) {
    throw new ErrorValidacionFel('La Venta no admite una Factura FEL FACT.')
  }

  if (factura.requiere_conciliacion !== false) {
    throw new ErrorValidacionFel(
      'La Factura requiere conciliación antes de cualquier nuevo envío.',
    )
  }

  const fechaEmision = exigirTexto(
    venta.fecha_confirmacion,
    'venta.fecha_confirmacion',
  )

  if (
    !PATRON_FECHA_CON_ZONA.test(fechaEmision) ||
    !Number.isFinite(Date.parse(fechaEmision))
  ) {
    throw new ErrorValidacionFel('La fecha persistida de la Venta no es válida.')
  }

  const nitReceptor = exigirSnapshotTexto(
    factura.nit_receptor_snapshot,
    'factura.nit_receptor_snapshot',
  )
  const nombreReceptor = exigirSnapshotTexto(
    factura.nombre_receptor_snapshot,
    'factura.nombre_receptor_snapshot',
  )
  const direccionReceptorSnapshot = exigirSnapshotTexto(
    factura.direccion_receptor_snapshot,
    'factura.direccion_receptor_snapshot',
  )
  const nitVenta = exigirSnapshotTexto(
    venta.comprador_nit,
    'venta.comprador_nit',
  )
  const nombreVenta = exigirSnapshotTexto(
    venta.comprador_nombre,
    'venta.comprador_nombre',
  )
  const direccionVenta = exigirSnapshotTexto(
    venta.comprador_direccion,
    'venta.comprador_direccion',
  )

  if (
    nitReceptor !== normalizarNit(nitReceptor) ||
    nitReceptor !== nitVenta ||
    nombreReceptor !== nombreVenta ||
    direccionReceptorSnapshot !== direccionVenta
  ) {
    throw new ErrorValidacionFel(
      'Los snapshots fiscales de la Factura no coinciden con la Venta.',
    )
  }

  const totalFactura = decimalExacto(
    factura.total_snapshot,
    'factura.total_snapshot',
    2,
  )
  const totalVenta = decimalExacto(venta.total, 'venta.total', 2)
  const subtotalVenta = decimalExacto(venta.subtotal, 'venta.subtotal', 2)

  if (
    compararDecimales(totalFactura, totalVenta) !== 0 ||
    compararDecimales(totalVenta, subtotalVenta) !== 0
  ) {
    throw new ErrorValidacionFel(
      'Los totales persistidos de la Factura y la Venta no coinciden.',
    )
  }

  let sumaDetalles = DECIMAL_CERO
  const lineas = new Set()
  const detallesValidados = [...detalles]
    .sort((a, b) => a.numero_linea - b.numero_linea)
    .map((detalle) => {
      if (detalle.venta_id !== venta.id) {
        throw new ErrorValidacionFel(
          'Un detalle no corresponde con la Venta persistida.',
        )
      }

      const numeroLinea = exigirEnteroEnRango(
        detalle.numero_linea,
        'detalle.numero_linea',
        100,
      )
      if (lineas.has(numeroLinea)) {
        throw new ErrorValidacionFel(
          `La línea ${numeroLinea} está duplicada en la Venta.`,
        )
      }
      lineas.add(numeroLinea)

      const cantidad = exigirEnteroEnRango(
        detalle.cantidad_presentaciones,
        'detalle.cantidad_presentaciones',
        1000000,
      )
      const precioUnitario = decimalExacto(
        detalle.precio_unitario,
        'detalle.precio_unitario',
        2,
      )
      const subtotal = decimalExacto(detalle.subtotal, 'detalle.subtotal', 2)
      const precio = multiplicarDecimalPorEntero(
        precioUnitario,
        cantidad,
        'detalle.cantidad_presentaciones',
      )

      if (compararDecimales(precio, subtotal) !== 0) {
        throw new ErrorValidacionFel(
          `El subtotal persistido de la línea ${numeroLinea} no coincide.`,
        )
      }

      const descripcion = [
        exigirSnapshotTexto(
          detalle.producto_nombre_snapshot,
          'producto_nombre_snapshot',
        ),
        exigirSnapshotTexto(
          detalle.presentacion_nombre_snapshot,
          'presentacion_nombre_snapshot',
        ),
        exigirSnapshotTexto(detalle.codigo_sku_snapshot, 'codigo_sku_snapshot'),
      ].join(' / ')

      sumaDetalles = sumarDecimales(sumaDetalles, subtotal)

      return {
        cantidad,
        descripcion,
        detalle,
        numeroLinea,
        precio,
        precioUnitario,
        subtotal,
      }
    })

  if (compararDecimales(sumaDetalles, totalFactura) !== 0) {
    throw new ErrorValidacionFel(
      'La suma de detalles no coincide con el total de la Factura.',
    )
  }

  return {
    detallesValidados,
    direccionReceptorSnapshot,
    factura,
    fechaEmision,
    nitReceptor,
    nombreReceptor,
    totalFactura,
    venta,
  }
}

const normalizarImpuestos = (impuestos, numeroLinea) => {
  if (!Array.isArray(impuestos) || impuestos.length === 0) {
    throw new ErrorConfiguracionTekra(
      `No existe tratamiento fiscal confirmado para la línea ${numeroLinea}.`,
    )
  }

  const normalizados = impuestos.map((impuesto, indice) => ({
    nombreCorto: exigirTexto(
      impuesto?.nombreCorto,
      `impuestos[${indice}].nombreCorto`,
    ),
    codigoUnidadGravable: exigirTexto(
      impuesto?.codigoUnidadGravable,
      `impuestos[${indice}].codigoUnidadGravable`,
    ),
    montoGravable: decimalExacto(
      impuesto?.montoGravable,
      `impuestos[${indice}].montoGravable`,
    ),
    montoImpuesto: decimalExacto(
      impuesto?.montoImpuesto,
      `impuestos[${indice}].montoImpuesto`,
    ),
  }))

  const nombres = normalizados.map((impuesto) => impuesto.nombreCorto)
  if (new Set(nombres).size !== nombres.length) {
    throw new ErrorConfiguracionTekra(
      `El tratamiento fiscal de la línea ${numeroLinea} repite impuestos.`,
    )
  }

  return normalizados
}

const xmlImpuesto = (impuesto) => `
              <dte:Impuesto>
                <dte:NombreCorto>${escaparTextoXml(impuesto.nombreCorto)}</dte:NombreCorto>
                <dte:CodigoUnidadGravable>${escaparTextoXml(impuesto.codigoUnidadGravable)}</dte:CodigoUnidadGravable>
                <dte:MontoGravable>${formatearDecimal(impuesto.montoGravable, 2)}</dte:MontoGravable>
                <dte:MontoImpuesto>${formatearDecimal(impuesto.montoImpuesto, 2)}</dte:MontoImpuesto>
              </dte:Impuesto>`

export function generarXmlFact(
  datos,
  configuracion,
  { resolverDireccionReceptor, resolverTratamientoFiscal } = {},
) {
  if (typeof resolverDireccionReceptor !== 'function') {
    throw new ErrorConfiguracionTekra(
      'Falta un resolver confirmado para la dirección fiscal del receptor.',
    )
  }

  if (typeof resolverTratamientoFiscal !== 'function') {
    throw new ErrorConfiguracionTekra(
      'Falta un resolver confirmado para impuestos y unidad de medida.',
    )
  }

  const fiscal = validarConfiguracionFiscalFel(configuracion)
  const {
    detallesValidados,
    direccionReceptorSnapshot,
    factura,
    fechaEmision,
    nitReceptor,
    nombreReceptor,
    totalFactura,
    venta,
  } = validarDatosPersistidosFact(datos)
  const direccionReceptor = validarDireccion(
    resolverDireccionReceptor({ factura, venta }),
    'receptor.direccion',
  )

  if (direccionReceptor.direccion !== direccionReceptorSnapshot) {
    throw new ErrorValidacionFel(
      'La dirección fiscal resuelta no coincide con el snapshot de la Venta.',
    )
  }

  const impuestosTotales = new Map()
  const items = detallesValidados.map(
    ({
      cantidad,
      descripcion,
      detalle,
      numeroLinea,
      precio,
      precioUnitario,
      subtotal,
    }) => {
      const tratamiento = resolverTratamientoFiscal({
        factura,
        venta,
        detalle,
        subtotal: formatearDecimal(subtotal, 2),
      })
      const bienOServicio = exigirTexto(
        tratamiento?.bienOServicio,
        'tratamientoFiscal.bienOServicio',
      )
      const unidadMedida = exigirTexto(
        tratamiento?.unidadMedida,
        'tratamientoFiscal.unidadMedida',
      )
      const impuestos = normalizarImpuestos(
        tratamiento?.impuestos,
        numeroLinea,
      )

      for (const impuesto of impuestos) {
        impuestosTotales.set(
          impuesto.nombreCorto,
          sumarDecimales(
            impuestosTotales.get(impuesto.nombreCorto) ?? DECIMAL_CERO,
            impuesto.montoImpuesto,
          ),
        )
      }

      return `
          <dte:Item BienOServicio="${escaparAtributoXml(bienOServicio)}" NumeroLinea="${numeroLinea}">
            <dte:Cantidad>${cantidad}</dte:Cantidad>
            <dte:UnidadMedida>${escaparTextoXml(unidadMedida)}</dte:UnidadMedida>
            <dte:Descripcion>${escaparTextoXml(descripcion)}</dte:Descripcion>
            <dte:PrecioUnitario>${formatearDecimal(precioUnitario, 2)}</dte:PrecioUnitario>
            <dte:Precio>${formatearDecimal(precio, 2)}</dte:Precio>
            <dte:Descuento>0.00</dte:Descuento>
            <dte:Impuestos>${impuestos.map(xmlImpuesto).join('')}
            </dte:Impuestos>
            <dte:Total>${formatearDecimal(subtotal, 2)}</dte:Total>
          </dte:Item>`
    },
  )

  const atributosCorreo = fiscal.emisor.correo
    ? ` CorreoEmisor="${escaparAtributoXml(fiscal.emisor.correo)}"`
    : ''
  const frasesXml = fiscal.frases
    .map(
      (frase) => `
          <dte:Frase TipoFrase="${escaparAtributoXml(frase.tipoFrase)}" CodigoEscenario="${escaparAtributoXml(frase.codigoEscenario)}"/>`,
    )
    .join('')
  const impuestosTotalesXml = [...impuestosTotales.entries()]
    .sort(([nombreA], [nombreB]) => nombreA.localeCompare(nombreB))
    .map(
      ([nombreCorto, monto]) => `
            <dte:TotalImpuesto NombreCorto="${escaparAtributoXml(nombreCorto)}" TotalMontoImpuesto="${formatearDecimal(monto, 2)}"/>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento Version="0.1" xmlns:dte="${NAMESPACE_DTE}" xmlns:cfc="${NAMESPACES_DOCUMENTO.cfc}" xmlns:cex="${NAMESPACES_DOCUMENTO.cex}" xmlns:cfe="${NAMESPACES_DOCUMENTO.cfe}" xmlns:cno="${NAMESPACES_DOCUMENTO.cno}" xmlns:ds="${NAMESPACES_DOCUMENTO.ds}" xmlns:xsi="${NAMESPACES_DOCUMENTO.xsi}">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">
        <dte:DatosGenerales Tipo="FACT" FechaHoraEmision="${escaparAtributoXml(fechaEmision)}" CodigoMoneda="GTQ"/>
        <dte:Emisor NITEmisor="${escaparAtributoXml(fiscal.emisor.nit)}" NombreEmisor="${escaparAtributoXml(fiscal.emisor.nombre)}" NombreComercial="${escaparAtributoXml(fiscal.emisor.nombreComercial)}" CodigoEstablecimiento="${escaparAtributoXml(fiscal.emisor.codigoEstablecimiento)}" AfiliacionIVA="${escaparAtributoXml(fiscal.emisor.afiliacionIva)}"${atributosCorreo}>${xmlDireccion('DireccionEmisor', fiscal.emisor.direccion)}
        </dte:Emisor>
        <dte:Receptor IDReceptor="${escaparAtributoXml(nitReceptor)}" NombreReceptor="${escaparAtributoXml(nombreReceptor)}">${xmlDireccion('DireccionReceptor', direccionReceptor)}
        </dte:Receptor>
        <dte:Frases>${frasesXml}
        </dte:Frases>
        <dte:Items>${items.join('')}
        </dte:Items>
        <dte:Totales>
          <dte:TotalImpuestos>${impuestosTotalesXml}
          </dte:TotalImpuestos>
          <dte:GranTotal>${formatearDecimal(totalFactura, 2)}</dte:GranTotal>
        </dte:Totales>
      </dte:DatosEmision>
    </dte:DTE>
    <dte:Adenda>
      <DECertificador>${escaparTextoXml(factura.id)}</DECertificador>
    </dte:Adenda>
  </dte:SAT>
</dte:GTDocumento>`
}
