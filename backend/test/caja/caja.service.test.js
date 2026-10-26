import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const { crearServicioCaja, ErrorServicioCaja } = await import(
  '../../src/services/caja.service.js'
)

const CAJA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USUARIO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CLAVE_IDEMPOTENCIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const respuestasValidas = {
  abrir_caja: {
    cambio: true,
    caja: { id: CAJA_ID, fondo_inicial: '100.00', estado: 'abierta' },
  },
  obtener_caja_actual: {
    caja: { id: CAJA_ID, estado: 'abierta' },
    resumen: { efectivo_esperado: '100.00' },
  },
  obtener_resumen_caja_actual: {
    caja_id: CAJA_ID,
    resumen: { efectivo_esperado: '100.00' },
  },
  cerrar_caja: {
    cambio: true,
    caja: { id: CAJA_ID, estado: 'cerrada' },
  },
  listar_cajas: {
    cajas: [],
    paginacion: { pagina: 1, limite: 20, total: 0, total_paginas: 0 },
  },
  obtener_caja: {
    caja: { id: CAJA_ID, estado: 'cerrada' },
    resumen: { efectivo_esperado: '100.00' },
  },
}

const crearDependenciaRpc = (respuestas = respuestasValidas) => {
  const llamadas = []
  const tokens = []
  const crearCliente = (token) => {
    tokens.push(token)
    return {
      async rpc(nombre, parametros) {
        llamadas.push({ nombre, parametros })
        const respuesta = respuestas[nombre]
        if (respuesta?.error) return respuesta
        return { data: respuesta, error: null }
      },
    }
  }

  return { crearCliente, llamadas, tokens }
}

test('envía a las seis RPC únicamente sus parámetros exactos', async () => {
  const dependencia = crearDependenciaRpc()
  const servicio = crearServicioCaja(dependencia)

  await servicio.abrirCaja('jwt', CLAVE_IDEMPOTENCIA, '100.00')
  await servicio.obtenerCajaActual('jwt')
  await servicio.obtenerResumenCajaActual('jwt')
  await servicio.cerrarCaja(
    'jwt',
    CAJA_ID,
    CLAVE_IDEMPOTENCIA,
    { efectivo_contado: '125.50', observaciones: 'Cierre normal' },
  )
  await servicio.listarCajas('jwt', {
    pagina: 2,
    limite: 50,
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-25',
    usuarioId: USUARIO_ID,
    estado: 'cerrada',
  })
  await servicio.obtenerCaja('jwt', CAJA_ID)

  assert.deepEqual(dependencia.tokens, [
    'jwt',
    'jwt',
    'jwt',
    'jwt',
    'jwt',
    'jwt',
  ])
  assert.deepEqual(dependencia.llamadas, [
    {
      nombre: 'abrir_caja',
      parametros: {
        p_clave_idempotencia: CLAVE_IDEMPOTENCIA,
        p_fondo_inicial: '100.00',
      },
    },
    { nombre: 'obtener_caja_actual', parametros: undefined },
    { nombre: 'obtener_resumen_caja_actual', parametros: undefined },
    {
      nombre: 'cerrar_caja',
      parametros: {
        p_caja_turno_id: CAJA_ID,
        p_clave_idempotencia: CLAVE_IDEMPOTENCIA,
        p_efectivo_contado: '125.50',
        p_observaciones: 'Cierre normal',
      },
    },
    {
      nombre: 'listar_cajas',
      parametros: {
        p_pagina: 2,
        p_limite: 50,
        p_fecha_desde: '2026-10-01',
        p_fecha_hasta: '2026-10-25',
        p_usuario_id: USUARIO_ID,
        p_estado: 'cerrada',
      },
    },
    {
      nombre: 'obtener_caja',
      parametros: { p_caja_turno_id: CAJA_ID },
    },
  ])
})

test('acepta la ausencia de caja abierta y conserva importes decimales', async () => {
  const respuestas = structuredClone(respuestasValidas)
  respuestas.obtener_caja_actual = { caja: null, resumen: null }
  respuestas.obtener_resumen_caja_actual = { caja_id: null, resumen: null }
  respuestas.abrir_caja.caja.fondo_inicial = '999999999999.99'
  const servicio = crearServicioCaja(crearDependenciaRpc(respuestas))

  const apertura = await servicio.abrirCaja(
    'jwt',
    CLAVE_IDEMPOTENCIA,
    '999999999999.99',
  )
  const actual = await servicio.obtenerCajaActual('jwt')
  const resumen = await servicio.obtenerResumenCajaActual('jwt')

  assert.equal(apertura.caja.fondo_inicial, '999999999999.99')
  assert.deepEqual(actual, { caja: null, resumen: null })
  assert.deepEqual(resumen, { caja_id: null, resumen: null })
})

test('propaga código y detalle PostgreSQL mediante ErrorServicioCaja', async () => {
  const dependencia = crearDependenciaRpc({
    abrir_caja: {
      data: null,
      error: { code: '23505', message: 'El usuario ya tiene una caja abierta.' },
    },
  })
  const servicio = crearServicioCaja(dependencia)

  await assert.rejects(
    servicio.abrirCaja('jwt', CLAVE_IDEMPOTENCIA, '100.00'),
    (error) =>
      error instanceof ErrorServicioCaja &&
      error.codigo === '23505' &&
      error.detalle === 'El usuario ya tiene una caja abierta.',
  )
})

test('rechaza respuestas de Supabase con formato inesperado', async () => {
  const servicio = crearServicioCaja(
    crearDependenciaRpc({ obtener_caja_actual: { caja: null, resumen: {} } }),
  )

  await assert.rejects(
    servicio.obtenerCajaActual('jwt'),
    /formato inválido/i,
  )
})
