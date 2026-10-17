import { compararDecimales, decimalExacto } from './decimal-exacto.js'
import { ErrorResultadoInciertoTekra, ErrorValidacionFel } from './errores.js'
import { validarDatosPersistidosFact } from './generador-fact.js'
import { buscarPrimerNodoLocal, parsearXmlSeguro, textoNodo } from './xml-seguro.js'

const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAMESPACE_DTE = 'http://www.sat.gob.gt/dte/fel/0.2.0'

const buscarHijoLocal = (nodo, nombreLocal) =>
  nodo?.hijos.find((hijo) => hijo.nombreLocal === nombreLocal) ?? null

const validarXmlPersistido = (xml, factura) => {
  const raiz = parsearXmlSeguro(xml)
  const sat = buscarHijoLocal(raiz, 'SAT')
  const adenda = buscarHijoLocal(sat, 'Adenda')
  const identificador = adenda
    ? buscarPrimerNodoLocal(adenda, 'DECertificador')
    : null
  const datosGenerales = buscarPrimerNodoLocal(raiz, 'DatosGenerales')
  const receptor = buscarPrimerNodoLocal(raiz, 'Receptor')
  const granTotal = buscarPrimerNodoLocal(raiz, 'GranTotal')

  if (
    raiz.nombreLocal !== 'GTDocumento' ||
    raiz.atributos.get('xmlns:dte') !== NAMESPACE_DTE ||
    datosGenerales?.atributos.get('Tipo') !== 'FACT' ||
    !identificador ||
    textoNodo(identificador) !== factura.id ||
    receptor?.atributos.get('IDReceptor') !==
      factura.nit_receptor_snapshot ||
    receptor?.atributos.get('NombreReceptor') !==
      factura.nombre_receptor_snapshot ||
    !granTotal
  ) {
    throw new ErrorValidacionFel(
      'El XML persistido no corresponde con la Factura FEL.',
    )
  }

  const totalXml = decimalExacto(textoNodo(granTotal), 'xml.GranTotal')
  const totalFactura = decimalExacto(
    factura.total_snapshot,
    'factura.total_snapshot',
    2,
  )

  if (compararDecimales(totalXml, totalFactura) !== 0) {
    throw new ErrorValidacionFel(
      'El total del XML persistido no corresponde con la Factura FEL.',
    )
  }
}

export async function prepararYReclamarFacturaFel({
  facturaId,
  repositorio,
  generarXml,
  reclamarFactura,
}) {
  if (
    typeof repositorio?.obtenerFacturaParaPreparacion !== 'function' ||
    typeof generarXml !== 'function' ||
    typeof reclamarFactura !== 'function'
  ) {
    throw new TypeError('Las dependencias del flujo FEL están incompletas.')
  }

  if (typeof facturaId !== 'string' || !PATRON_UUID.test(facturaId)) {
    throw new TypeError('El identificador de la Factura FEL no es válido.')
  }

  const datos = await repositorio.obtenerFacturaParaPreparacion(facturaId)
  if (datos?.factura?.id !== facturaId) {
    throw new ErrorValidacionFel(
      'La Factura cargada no corresponde con el identificador solicitado.',
    )
  }
  validarDatosPersistidosFact(datos)

  const xml = datos.factura.xml_solicitud ?? generarXml(datos)
  validarXmlPersistido(xml, datos.factura)

  return reclamarFactura(datos.factura.id, xml)
}

export function mapearResultadoCertificadoParaFinalizacion(
  resultado,
  pdfStoragePath,
) {
  if (resultado?.tipo !== 'certificada') {
    throw new ErrorValidacionFel(
      'Solo una certificación comprobada puede finalizar como certificada.',
    )
  }

  if (
    typeof pdfStoragePath !== 'string' ||
    !pdfStoragePath.trim() ||
    pdfStoragePath.trim().length > 1000
  ) {
    throw new ErrorValidacionFel(
      'El PDF debe almacenarse antes de finalizar la Factura.',
    )
  }

  return {
    tipo: 'certificada',
    uuid_fel: resultado.uuidFel,
    serie_fel: resultado.serieFel,
    numero_fel: resultado.numeroFel,
    fecha_certificacion: resultado.fechaCertificacion,
    xml_certificado: resultado.xmlCertificado,
    respuesta_certificador: resultado.respuestaCertificador,
    pdf_storage_path: pdfStoragePath.trim(),
  }
}

export function mapearResultadoInciertoParaFinalizacion(error) {
  if (!(error instanceof ErrorResultadoInciertoTekra)) {
    throw new TypeError('El error no representa un resultado incierto.')
  }

  return {
    tipo: 'resultado_incierto',
    mensaje_error:
      'Resultado incierto de TEKRA; se requiere conciliación antes de reintentar.',
    respuesta_certificador: {
      error: true,
      requiereConciliacion: true,
    },
  }
}

export async function finalizarResultadoConClaim({
  facturaId,
  tokenProcesamiento,
  resultado,
  pdfStoragePath,
  finalizarFactura,
}) {
  if (
    typeof facturaId !== 'string' ||
    !PATRON_UUID.test(facturaId) ||
    typeof tokenProcesamiento !== 'string' ||
    !PATRON_UUID.test(tokenProcesamiento) ||
    typeof finalizarFactura !== 'function'
  ) {
    throw new TypeError('Los datos del claim FEL están incompletos.')
  }

  const finalizacion =
    resultado instanceof ErrorResultadoInciertoTekra
      ? mapearResultadoInciertoParaFinalizacion(resultado)
      : mapearResultadoCertificadoParaFinalizacion(resultado, pdfStoragePath)

  return finalizarFactura(facturaId, tokenProcesamiento, finalizacion)
}
