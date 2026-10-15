import {
  compararDecimales,
  DECIMAL_CERO,
  decimalExacto,
  formatearDecimal,
  multiplicarDecimalPorEntero,
  sumarDecimales,
} from './decimal-exacto.js'
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

const exigirEnteroPositivo = (valor, campo) => {
  if (!Number.isSafeInteger(valor) || valor < 1) {
    throw new ErrorValidacionFel(`${campo} debe ser un entero positivo.`)
  }
  return valor
}

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

const validarConfiguracion = (configuracion) => {
  if (configuracion?.contratoXmlConfirmado !== true) {
    throw new ErrorConfiguracionTekra(
      'El contrato XML FEL no ha sido confirmado para producción.',
    )
  }

  const emisor = configuracion.emisor
  const frases = configuracion.frases

  if (!Array.isArray(frases) || frases.length === 0) {
    throw new ErrorConfiguracionTekra(
      'No existen frases fiscales confirmadas para el emisor.',
    )
  }

  return {
    emisor: {
      nit: exigirTexto(emisor?.nit, 'emisor.nit'),
      nombre: exigirTexto(emisor?.nombre, 'emisor.nombre'),
      nombreComercial: exigirTexto(
        emisor?.nombreComercial,
        'emisor.nombreComercial',
      ),
      afiliacionIva: exigirTexto(emisor?.afiliacionIva, 'emisor.afiliacionIva'),
      codigoEstablecimiento: exigirTexto(
        emisor?.codigoEstablecimiento,
        'emisor.codigoEstablecimiento',
      ),
      correo:
        emisor?.correo === null || emisor?.correo === undefined
          ? null
          : exigirTexto(emisor.correo, 'emisor.correo'),
      direccion: validarDireccion(emisor?.direccion, 'emisor.direccion'),
    },
    frases: frases.map((frase, indice) => ({
      tipoFrase: exigirTexto(frase?.tipoFrase, `frases[${indice}].tipoFrase`),
      codigoEscenario: exigirTexto(
        frase?.codigoEscenario,
        `frases[${indice}].codigoEscenario`,
      ),
    })),
  }
}

const validarDatosPersistidos = (datos) => {
  const { factura, venta, detalles } = datos ?? {}

  if (
    !factura ||
    !venta ||
    !Array.isArray(detalles) ||
    detalles.length === 0
  ) {
    throw new ErrorValidacionFel('Los datos persistidos de la Venta están incompletos.')
  }

  if (!PATRON_UUID.test(factura.id) || factura.venta_id !== venta.id) {
    throw new ErrorValidacionFel('La Factura no corresponde con la Venta persistida.')
  }

  if (
    factura.tipo_documento !== 'FACT' ||
    !['pendiente', 'error'].includes(factura.estado) ||
    venta.estado !== 'confirmada'
  ) {
    throw new ErrorValidacionFel('La Venta no admite una Factura FEL FACT.')
  }

  if (factura.requiere_conciliacion === true) {
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

  exigirTexto(factura.nit_receptor_snapshot, 'factura.nit_receptor_snapshot')
  exigirTexto(
    factura.nombre_receptor_snapshot,
    'factura.nombre_receptor_snapshot',
  )

  return { factura, venta, detalles, fechaEmision }
}

const descripcionDetalle = (detalle) =>
  [
    exigirTexto(detalle.producto_nombre_snapshot, 'producto_nombre_snapshot'),
    exigirTexto(detalle.presentacion_nombre_snapshot, 'presentacion_nombre_snapshot'),
    exigirTexto(detalle.codigo_sku_snapshot, 'codigo_sku_snapshot'),
  ].join(' / ')

const normalizarImpuestos = (impuestos, numeroLinea) => {
  if (!Array.isArray(impuestos) || impuestos.length === 0) {
    throw new ErrorConfiguracionTekra(
      `No existe tratamiento fiscal confirmado para la línea ${numeroLinea}.`,
    )
  }

  return impuestos.map((impuesto, indice) => ({
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

  const fiscal = validarConfiguracion(configuracion)
  const { factura, venta, detalles, fechaEmision } =
    validarDatosPersistidos(datos)
  const direccionReceptor = validarDireccion(
    resolverDireccionReceptor({ factura, venta }),
    'receptor.direccion',
  )
  const totalFactura = decimalExacto(
    factura.total_snapshot,
    'factura.total_snapshot',
    2,
  )
  const totalVenta = decimalExacto(venta.total, 'venta.total', 2)

  if (compararDecimales(totalFactura, totalVenta) !== 0) {
    throw new ErrorValidacionFel('El total de la Factura no coincide con la Venta.')
  }

  let sumaDetalles = DECIMAL_CERO
  const impuestosTotales = new Map()
  const items = [...detalles]
    .sort((a, b) => a.numero_linea - b.numero_linea)
    .map((detalle) => {
      const numeroLinea = exigirEnteroPositivo(
        detalle.numero_linea,
        'detalle.numero_linea',
      )
      const cantidad = exigirEnteroPositivo(
        detalle.cantidad_presentaciones,
        'detalle.cantidad_presentaciones',
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

      sumaDetalles = sumarDecimales(sumaDetalles, subtotal)

      return `
          <dte:Item BienOServicio="${escaparAtributoXml(bienOServicio)}" NumeroLinea="${numeroLinea}">
            <dte:Cantidad>${cantidad}</dte:Cantidad>
            <dte:UnidadMedida>${escaparTextoXml(unidadMedida)}</dte:UnidadMedida>
            <dte:Descripcion>${escaparTextoXml(descripcionDetalle(detalle))}</dte:Descripcion>
            <dte:PrecioUnitario>${formatearDecimal(precioUnitario, 2)}</dte:PrecioUnitario>
            <dte:Precio>${formatearDecimal(precio, 2)}</dte:Precio>
            <dte:Descuento>0.00</dte:Descuento>
            <dte:Impuestos>${impuestos.map(xmlImpuesto).join('')}
            </dte:Impuestos>
            <dte:Total>${formatearDecimal(subtotal, 2)}</dte:Total>
          </dte:Item>`
    })

  if (compararDecimales(sumaDetalles, totalFactura) !== 0) {
    throw new ErrorValidacionFel(
      'La suma de detalles no coincide con el total de la Factura.',
    )
  }

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
        <dte:Receptor IDReceptor="${escaparAtributoXml(factura.nit_receptor_snapshot)}" NombreReceptor="${escaparAtributoXml(factura.nombre_receptor_snapshot)}">${xmlDireccion('DireccionReceptor', direccionReceptor)}
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
