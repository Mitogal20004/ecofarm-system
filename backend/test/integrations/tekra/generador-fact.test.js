import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buscarPrimerNodoLocal,
  parsearXmlSeguro,
  textoNodo,
} from '../../../src/integrations/tekra/xml-seguro.js'
import { generarXmlFact } from '../../../src/integrations/tekra/generador-fact.js'

const FACTURA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const crearDatos = () => ({
  factura: {
    id: FACTURA_ID,
    venta_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    estado: 'pendiente',
    tipo_documento: 'FACT',
    nit_receptor_snapshot: 'CF',
    nombre_receptor_snapshot: 'María & Asociados <Central>',
    direccion_receptor_snapshot: '5a. avenida & 1a. calle',
    total_snapshot: '100.00',
    xml_solicitud: null,
    requiere_conciliacion: false,
  },
  venta: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    numero: 'VTA-A01-000001',
    estado: 'confirmada',
    comprador_nombre: 'María & Asociados <Central>',
    comprador_nit: 'CF',
    comprador_direccion: '5a. avenida & 1a. calle',
    subtotal: '100.00',
    total: '100.00',
    fecha_confirmacion: '2026-10-14T10:30:00-06:00',
  },
  detalles: [
    {
      venta_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      numero_linea: 1,
      producto_nombre_snapshot: 'Snapdragon & flores',
      presentacion_nombre_snapshot: 'Caja <10>',
      codigo_sku_snapshot: 'SNAP-ROJO-60',
      cantidad_presentaciones: 2,
      precio_unitario: '50.00',
      subtotal: '100.00',
    },
  ],
})

const configuracion = {
  contratoXmlConfirmado: true,
  emisor: {
    nit: '1234567',
    nombre: 'Emisor de prueba',
    nombreComercial: 'E-farm prueba',
    afiliacionIva: 'CONFIGURACION_CONFIRMADA',
    codigoEstablecimiento: '1',
    correo: 'pruebas@example.invalid',
    direccion: {
      direccion: 'Dirección persistida del emisor',
      codigoPostal: '01001',
      municipio: 'Municipio confirmado',
      departamento: 'Departamento confirmado',
      pais: 'GT',
    },
  },
  frases: [{ tipoFrase: '1', codigoEscenario: '1' }],
}

const adaptadores = {
  resolverDireccionReceptor: ({ factura }) => ({
    direccion: factura.direccion_receptor_snapshot,
    codigoPostal: '01001',
    municipio: 'Municipio confirmado',
    departamento: 'Departamento confirmado',
    pais: 'GT',
  }),
  resolverTratamientoFiscal: () => ({
    bienOServicio: 'B',
    unidadMedida: 'UNI',
    impuestos: [
      {
        nombreCorto: 'IVA',
        codigoUnidadGravable: '1',
        montoGravable: '89.29',
        montoImpuesto: '10.71',
      },
    ],
  }),
}

test('genera un XML FACT estructural, escapado y determinista', () => {
  const datos = crearDatos()
  const xml = generarXmlFact(datos, configuracion, adaptadores)
  const repetido = generarXmlFact(datos, configuracion, adaptadores)
  const raiz = parsearXmlSeguro(xml)

  assert.equal(xml, repetido)
  assert.equal(raiz.nombreLocal, 'GTDocumento')
  assert.equal(raiz.atributos.get('Version'), '0.1')
  assert.equal(
    raiz.atributos.get('xmlns:dte'),
    'http://www.sat.gob.gt/dte/fel/0.2.0',
  )
  assert.deepEqual(
    Object.fromEntries(
      ['cfc', 'cex', 'cfe', 'cno', 'ds', 'xsi'].map((prefijo) => [
        prefijo,
        raiz.atributos.get(`xmlns:${prefijo}`),
      ]),
    ),
    {
      cfc: 'http://www.sat.gob.gt/dte/fel/CompCambiaria/0.1.0',
      cex: 'http://www.sat.gob.gt/face2/ComplementoExportaciones/0.1.0',
      cfe: 'http://www.sat.gob.gt/face2/ComplementoFacturaEspecial/0.1.0',
      cno: 'http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0',
      ds: 'http://www.w3.org/2000/09/xmldsig#',
      xsi: 'http://www.w3.org/2001/XMLSchema-instance',
    },
  )
  assert.equal(
    buscarPrimerNodoLocal(raiz, 'DatosGenerales').atributos.get('Tipo'),
    'FACT',
  )
  assert.equal(
    buscarPrimerNodoLocal(raiz, 'DatosGenerales').atributos.get('CodigoMoneda'),
    'GTQ',
  )
  assert.equal(
    buscarPrimerNodoLocal(raiz, 'Receptor').atributos.get('NombreReceptor'),
    'María & Asociados <Central>',
  )
  assert.equal(
    textoNodo(buscarPrimerNodoLocal(raiz, 'Descripcion')),
    'Snapdragon & flores / Caja <10> / SNAP-ROJO-60',
  )
  assert.equal(
    textoNodo(buscarPrimerNodoLocal(raiz, 'DECertificador')),
    FACTURA_ID,
  )
  const sat = buscarPrimerNodoLocal(raiz, 'SAT')
  assert.equal(
    sat.hijos.some((hijo) => hijo.nombreLocal === 'Adenda'),
    true,
  )
  assert.equal(textoNodo(buscarPrimerNodoLocal(raiz, 'GranTotal')), '100.00')
})

test('rechaza configuración fiscal no confirmada o incompleta', () => {
  assert.throws(
    () =>
      generarXmlFact(
        crearDatos(),
        { ...configuracion, contratoXmlConfirmado: false },
        adaptadores,
      ),
    /contrato XML FEL no ha sido confirmado/i,
  )

  assert.throws(
    () =>
      generarXmlFact(
        crearDatos(),
        {
          ...configuracion,
          emisor: { ...configuracion.emisor, nit: '' },
        },
        adaptadores,
      ),
    /emisor\.nit es obligatorio/i,
  )
})

test('rechaza totales persistidos incoherentes sin usar floats', () => {
  const datos = crearDatos()
  datos.detalles[0].subtotal = '99.99'

  assert.throws(
    () => generarXmlFact(datos, configuracion, adaptadores),
    /subtotal persistido.*no coincide/i,
  )
})

test('rechaza subtotal y total incoherentes en la Venta persistida', () => {
  const datos = crearDatos()
  datos.venta.subtotal = '99.99'

  assert.throws(
    () => generarXmlFact(datos, configuracion, adaptadores),
    /totales persistidos de la Factura y la Venta no coinciden/i,
  )
})

test('rechaza snapshots fiscales distintos de la Venta', () => {
  const datos = crearDatos()
  datos.factura.nit_receptor_snapshot = '1234567K'

  assert.throws(
    () => generarXmlFact(datos, configuracion, adaptadores),
    /snapshots fiscales.*no coinciden/i,
  )
})

test('rechaza una Venta sin dirección fiscal persistida', () => {
  const datos = crearDatos()
  datos.factura.direccion_receptor_snapshot = null
  datos.venta.comprador_direccion = null

  assert.throws(
    () => generarXmlFact(datos, configuracion, adaptadores),
    /factura\.direccion_receptor_snapshot es obligatorio/i,
  )
})

test('rechaza dirección resuelta distinta del snapshot persistido', () => {
  const adaptadoresInconsistentes = {
    ...adaptadores,
    resolverDireccionReceptor: () => ({
      direccion: 'Dirección diferente',
      codigoPostal: '01001',
      municipio: 'Municipio confirmado',
      departamento: 'Departamento confirmado',
      pais: 'GT',
    }),
  }

  assert.throws(
    () => generarXmlFact(crearDatos(), configuracion, adaptadoresInconsistentes),
    /dirección fiscal resuelta.*snapshot/i,
  )
})

test('rechaza líneas duplicadas aunque la entrada no provenga del frontend', () => {
  const datos = crearDatos()
  datos.detalles.push({ ...datos.detalles[0] })
  datos.factura.total_snapshot = '200.00'
  datos.venta.subtotal = '200.00'
  datos.venta.total = '200.00'

  assert.throws(
    () => generarXmlFact(datos, configuracion, adaptadores),
    /línea 1.*duplicada/i,
  )
})

test('rechaza impuestos repetidos sin asumir su fórmula tributaria', () => {
  const tratamientoDuplicado = {
    ...adaptadores,
    resolverTratamientoFiscal: () => ({
      bienOServicio: 'B',
      unidadMedida: 'UNI',
      impuestos: [
        {
          nombreCorto: 'IVA',
          codigoUnidadGravable: '1',
          montoGravable: '89.29',
          montoImpuesto: '10.71',
        },
        {
          nombreCorto: 'IVA',
          codigoUnidadGravable: '1',
          montoGravable: '89.29',
          montoImpuesto: '10.71',
        },
      ],
    }),
  }

  assert.throws(
    () => generarXmlFact(crearDatos(), configuracion, tratamientoDuplicado),
    /repite impuestos/i,
  )
})
