import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const { crearControladoresCaja, validadoresCaja } = await import(
  '../../src/controllers/caja.controller.js'
)
const { ErrorServicioCaja } = await import(
  '../../src/services/caja.service.js'
)

const CAJA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USUARIO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CLAVE_IDEMPOTENCIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const VENTA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const DEVOLUCION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const crearRespuesta = () => ({
  estado: null,
  cuerpo: null,
  status(codigo) {
    this.estado = codigo
    return this
  },
  json(cuerpo) {
    this.cuerpo = cuerpo
    return this
  },
})

test('normaliza importes, observaciones y filtros admitidos', () => {
  assert.deepEqual(
    validadoresCaja.crearDatosApertura({ fondo_inicial: ' 100.50 ' }),
    { fondo_inicial: '100.50' },
  )
  assert.deepEqual(
    validadoresCaja.crearDatosApertura({
      fondo_inicial: '999999999999.99',
    }),
    { fondo_inicial: '999999999999.99' },
  )
  assert.deepEqual(
    validadoresCaja.crearDatosCierre({
      efectivo_contado: 125.5,
      observaciones: '  Cierre   normal  ',
    }),
    { efectivo_contado: '125.5', observaciones: 'Cierre normal' },
  )
  assert.deepEqual(
    validadoresCaja.crearOpcionesListado({
      pagina: '2',
      limite: '100',
      fecha_desde: '2026-10-01',
      fecha_hasta: '2026-10-25',
      usuario_id: USUARIO_ID,
      estado: ' CERRADA ',
    }),
    {
      pagina: 2,
      limite: 100,
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-25',
      usuarioId: USUARIO_ID,
      estado: 'cerrada',
    },
  )
})

test('rechaza campos desconocidos, montos y períodos inválidos', () => {
  assert.throws(() =>
    validadoresCaja.crearDatosApertura({
      fondo_inicial: '100.00',
      usuario_id: USUARIO_ID,
    }),
  )
  assert.throws(() =>
    validadoresCaja.crearDatosCierre({ efectivo_contado: '-1.00' }),
  )
  assert.throws(() =>
    validadoresCaja.crearDatosCierre({ efectivo_contado: '1.001' }),
  )
  assert.throws(() =>
    validadoresCaja.crearDatosCierre({
      efectivo_contado: '1000000000000.00',
    }),
  )
  assert.throws(() =>
    validadoresCaja.crearOpcionesListado({
      fecha_desde: '2026-10-26',
      fecha_hasta: '2026-10-25',
    }),
  )
  assert.throws(() =>
    validadoresCaja.crearOpcionesListado({ limite: '101' }),
  )
})

test('apertura y cierre entregan al servicio token e idempotencia', async () => {
  const llamadas = []
  const controladores = crearControladoresCaja({
    async abrirCaja(...argumentos) {
      llamadas.push(['abrir', ...argumentos])
      return { cambio: true, caja: { id: CAJA_ID } }
    },
    async cerrarCaja(...argumentos) {
      llamadas.push(['cerrar', ...argumentos])
      return { cambio: true, caja: { id: CAJA_ID } }
    },
  })
  const respuestaApertura = crearRespuesta()
  const respuestaCierre = crearRespuesta()

  await controladores.abrirCaja(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      body: { fondo_inicial: '100.00' },
    },
    respuestaApertura,
  )
  await controladores.cerrarCaja(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      params: { cajaId: CAJA_ID },
      body: { efectivo_contado: '150.00', observaciones: '' },
    },
    respuestaCierre,
  )

  assert.equal(respuestaApertura.estado, 201)
  assert.equal(respuestaCierre.estado, 200)
  assert.deepEqual(llamadas, [
    ['abrir', 'jwt', CLAVE_IDEMPOTENCIA, '100.00'],
    [
      'cerrar',
      'jwt',
      CAJA_ID,
      CLAVE_IDEMPOTENCIA,
      { efectivo_contado: '150.00', observaciones: null },
    ],
  ])
})

test('un reintento idempotente de apertura responde 200', async () => {
  const controladores = crearControladoresCaja({
    abrirCaja: async () => ({ cambio: false, caja: { id: CAJA_ID } }),
  })
  const respuesta = crearRespuesta()

  await controladores.abrirCaja(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      body: { fondo_inicial: '100.00' },
    },
    respuesta,
  )

  assert.equal(respuesta.estado, 200)
})

test('rechaza una solicitud inválida antes de llamar al servicio', async () => {
  let llamadas = 0
  const controladores = crearControladoresCaja({
    abrirCaja: async () => {
      llamadas += 1
    },
  })
  const respuesta = crearRespuesta()

  await controladores.abrirCaja(
    {
      autenticacion: { token: 'jwt' },
      get: () => 'uuid-inválido',
      body: { fondo_inicial: '100.00' },
    },
    respuesta,
  )

  assert.equal(llamadas, 0)
  assert.equal(respuesta.estado, 400)
  assert.equal(respuesta.cuerpo.ok, false)
})

test('traduce errores PostgreSQL seguros sin exponer detalles internos', async () => {
  const errorCajaAbierta = new ErrorServicioCaja('fallo', {
    code: '23505',
    message: 'El usuario ya tiene una caja abierta.',
  })
  const errorInesperado = new Error('secreto interno')
  const controladores = crearControladoresCaja({
    abrirCaja: async () => {
      throw errorCajaAbierta
    },
    obtenerCaja: async () => {
      throw errorInesperado
    },
  })
  const respuestaConflicto = crearRespuesta()
  const respuestaInesperada = crearRespuesta()

  await controladores.abrirCaja(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      body: { fondo_inicial: '100.00' },
    },
    respuestaConflicto,
  )
  await controladores.obtenerCaja(
    {
      autenticacion: { token: 'jwt' },
      params: { cajaId: CAJA_ID },
    },
    respuestaInesperada,
  )

  assert.equal(respuestaConflicto.estado, 409)
  assert.equal(respuestaConflicto.cuerpo.message, 'Ya tienes una caja abierta.')
  assert.equal(respuestaInesperada.estado, 500)
  assert.doesNotMatch(
    JSON.stringify(respuestaInesperada.cuerpo),
    /secreto|stack/i,
  )
})

test('consulta y registra una devolución con los contratos exactos', async () => {
  const llamadas = []
  const controladores = crearControladoresCaja({
    async obtenerEstadoDevolucionVenta(...argumentos) {
      llamadas.push(['consultar', ...argumentos])
      return {
        venta_id: VENTA_ID,
        estado_venta: 'anulada',
        total: 50,
        tiene_ingreso_caja: true,
        devolucion_registrada: false,
        devolucion: null,
      }
    },
    async registrarDevolucionVenta(...argumentos) {
      llamadas.push(['registrar', ...argumentos])
      return {
        cambio: true,
        devolucion: { id: DEVOLUCION_ID, venta_id: VENTA_ID },
      }
    },
  })
  const respuestaConsulta = crearRespuesta()
  const respuestaRegistro = crearRespuesta()

  await controladores.obtenerEstadoDevolucionVenta(
    {
      autenticacion: { token: 'jwt' },
      params: { ventaId: VENTA_ID },
    },
    respuestaConsulta,
  )
  await controladores.registrarDevolucionVenta(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: '  Devolución   completa  ' },
    },
    respuestaRegistro,
  )

  assert.equal(respuestaConsulta.estado, 200)
  assert.equal(respuestaRegistro.estado, 201)
  assert.deepEqual(llamadas, [
    ['consultar', 'jwt', VENTA_ID],
    [
      'registrar',
      'jwt',
      VENTA_ID,
      CLAVE_IDEMPOTENCIA,
      'Devolución completa',
    ],
  ])
})

test('un reintento idempotente de devolución responde 200', async () => {
  const controladores = crearControladoresCaja({
    registrarDevolucionVenta: async () => ({
      cambio: false,
      devolucion: { id: DEVOLUCION_ID },
    }),
  })
  const respuesta = crearRespuesta()

  await controladores.registrarDevolucionVenta(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: 'Devolución completa' },
    },
    respuesta,
  )

  assert.equal(respuesta.estado, 200)
})

test('un contrato RPC de devolución inválido nunca responde con éxito', async () => {
  const controladores = crearControladoresCaja({
    registrarDevolucionVenta: async () => {
      throw new ErrorServicioCaja(
        'Supabase devolvió una respuesta de caja con formato inválido.',
      )
    },
  })
  const respuesta = crearRespuesta()

  await controladores.registrarDevolucionVenta(
    {
      autenticacion: { token: 'jwt' },
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: 'Devolución completa' },
    },
    respuesta,
  )

  assert.equal(respuesta.estado, 500)
  assert.equal(respuesta.cuerpo.ok, false)
})

test('rechaza UUID, clave, campos e importe enviados por el cliente', async () => {
  let llamadas = 0
  const controladores = crearControladoresCaja({
    registrarDevolucionVenta: async () => {
      llamadas += 1
    },
  })

  const solicitudes = [
    {
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: 'venta-inválida' },
      body: { motivo: 'Devolución completa' },
    },
    {
      get: () => 'clave-inválida',
      params: { ventaId: VENTA_ID },
      body: { motivo: 'Devolución completa' },
    },
    {
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: 'Devolución completa', monto: '50.00' },
    },
    {
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: ' '.repeat(10) },
    },
    {
      get: () => CLAVE_IDEMPOTENCIA,
      params: { ventaId: VENTA_ID },
      body: { motivo: 'x'.repeat(501) },
    },
  ]

  for (const solicitud of solicitudes) {
    const respuesta = crearRespuesta()
    await controladores.registrarDevolucionVenta(
      { autenticacion: { token: 'jwt' }, ...solicitud },
      respuesta,
    )
    assert.equal(respuesta.estado, 400)
  }

  assert.equal(llamadas, 0)
})

test('traduce duplicados y reglas de negocio sin filtrar errores internos', async () => {
  const errorDuplicado = new ErrorServicioCaja('fallo', {
    code: '23505',
    message: 'La Venta ya tiene una devolucion de efectivo registrada.',
  })
  const errorEfectivo = new ErrorServicioCaja('fallo', {
    code: '23514',
    message: 'La caja abierta no tiene suficiente efectivo esperado para registrar la devolucion.',
  })
  const errorSupabase = new ErrorServicioCaja('fallo', {
    code: 'XX000',
    message: 'detalle interno sensible',
  })
  const respuestas = []

  for (const error of [errorDuplicado, errorEfectivo, errorSupabase]) {
    const controladores = crearControladoresCaja({
      registrarDevolucionVenta: async () => {
        throw error
      },
    })
    const respuesta = crearRespuesta()
    await controladores.registrarDevolucionVenta(
      {
        autenticacion: { token: 'jwt' },
        get: () => CLAVE_IDEMPOTENCIA,
        params: { ventaId: VENTA_ID },
        body: { motivo: 'Devolución completa' },
      },
      respuesta,
    )
    respuestas.push(respuesta)
  }

  assert.equal(respuestas[0].estado, 409)
  assert.match(respuestas[0].cuerpo.message, /ya tiene una devolución/)
  assert.equal(respuestas[1].estado, 409)
  assert.match(respuestas[1].cuerpo.message, /suficiente efectivo/)
  assert.equal(respuestas[2].estado, 500)
  assert.doesNotMatch(JSON.stringify(respuestas[2].cuerpo), /sensible|XX000/)
})
