import assert from 'node:assert/strict'
import test from 'node:test'
import { cargarConfiguracionFiscalFel } from '../../../src/integrations/tekra/configuracion.js'

const crearEntornoFiscal = () => ({
  FEL_XML_CONTRATO_CONFIRMADO: 'SI',
  FEL_EMISOR_NIT: 'NITCONFIRMADO',
  FEL_EMISOR_NOMBRE: 'Razón social confirmada',
  FEL_EMISOR_NOMBRE_COMERCIAL: 'Nombre comercial confirmado',
  FEL_EMISOR_AFILIACION_IVA: 'AFILIACION_CONFIRMADA',
  FEL_EMISOR_CODIGO_ESTABLECIMIENTO: 'CODIGO_CONFIRMADO',
  FEL_EMISOR_CORREO: 'facturacion@example.invalid',
  FEL_EMISOR_DIRECCION: 'Dirección fiscal confirmada',
  FEL_EMISOR_CODIGO_POSTAL: 'CODIGO_CONFIRMADO',
  FEL_EMISOR_MUNICIPIO: 'Municipio confirmado',
  FEL_EMISOR_DEPARTAMENTO: 'Departamento confirmado',
  FEL_EMISOR_PAIS: 'PAIS_CONFIRMADO',
  FEL_FRASES_JSON: JSON.stringify([
    { tipoFrase: 'TIPO_CONFIRMADO', codigoEscenario: 'ESCENARIO_CONFIRMADO' },
  ]),
})

test('carga únicamente una configuración fiscal completa y confirmada', () => {
  const configuracion = cargarConfiguracionFiscalFel(crearEntornoFiscal())

  assert.equal(configuracion.contratoXmlConfirmado, true)
  assert.equal(configuracion.emisor.nit, 'NITCONFIRMADO')
  assert.equal(configuracion.frases.length, 1)
})

test('rechaza configuración fiscal incompleta', () => {
  const entorno = crearEntornoFiscal()
  delete entorno.FEL_EMISOR_MUNICIPIO

  assert.throws(
    () => cargarConfiguracionFiscalFel(entorno),
    /FEL_EMISOR_MUNICIPIO/i,
  )
})

test('rechaza NIT del emisor sin normalizar y correo inválido', () => {
  assert.throws(
    () =>
      cargarConfiguracionFiscalFel({
        ...crearEntornoFiscal(),
        FEL_EMISOR_NIT: ' nit-confirmado ',
      }),
    /FEL_EMISOR_NIT debe estar normalizado/i,
  )

  assert.throws(
    () =>
      cargarConfiguracionFiscalFel({
        ...crearEntornoFiscal(),
        FEL_EMISOR_CORREO: 'correo-inválido',
      }),
    /FEL_EMISOR_CORREO.*formato válido/i,
  )
})

test('rechaza frases fiscales duplicadas', () => {
  const frase = {
    tipoFrase: 'TIPO_CONFIRMADO',
    codigoEscenario: 'ESCENARIO_CONFIRMADO',
  }

  assert.throws(
    () =>
      cargarConfiguracionFiscalFel({
        ...crearEntornoFiscal(),
        FEL_FRASES_JSON: JSON.stringify([frase, frase]),
      }),
    /frases fiscales duplicadas/i,
  )
})
