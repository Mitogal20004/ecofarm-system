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
const VENTA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const DEVOLUCION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const FECHA_MOVIMIENTO = '2026-10-29T14:30:00+00:00'

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
  obtener_estado_devolucion_venta: {
    venta_id: VENTA_ID,
    estado_venta: 'anulada',
    total: 50,
    tiene_ingreso_caja: true,
    devolucion_registrada: false,
    devolucion: null,
  },
  registrar_devolucion_venta: {
    cambio: true,
    devolucion: {
      id: DEVOLUCION_ID,
      venta_id: VENTA_ID,
      caja_turno_id: CAJA_ID,
      importe_devuelto: 50,
      variacion_efectivo: -50,
      usuario_id: USUARIO_ID,
      motivo: 'Devolución completa',
      fecha_movimiento: FECHA_MOVIMIENTO,
    },
  },
}

const crearEstadoConDevolucion = () => ({
  venta_id: VENTA_ID,
  estado_venta: 'anulada',
  total: 50,
  tiene_ingreso_caja: true,
  devolucion_registrada: true,
  devolucion: {
    id: DEVOLUCION_ID,
    caja_turno_id: CAJA_ID,
    importe_devuelto: 50,
    usuario_id: USUARIO_ID,
    motivo: 'Devolución completa',
    fecha_movimiento: FECHA_MOVIMIENTO,
  },
})

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

test('envía a las ocho RPC únicamente sus parámetros exactos', async () => {
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
  await servicio.obtenerEstadoDevolucionVenta('jwt', VENTA_ID)
  await servicio.registrarDevolucionVenta(
    'jwt',
    VENTA_ID,
    CLAVE_IDEMPOTENCIA,
    'Devolución completa',
  )

  assert.deepEqual(dependencia.tokens, [
    'jwt',
    'jwt',
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
    {
      nombre: 'obtener_estado_devolucion_venta',
      parametros: { p_venta_id: VENTA_ID },
    },
    {
      nombre: 'registrar_devolucion_venta',
      parametros: {
        p_venta_id: VENTA_ID,
        p_clave_idempotencia: CLAVE_IDEMPOTENCIA,
        p_motivo: 'Devolución completa',
      },
    },
  ])
})

test('acepta el reintento idempotente de una devolución', async () => {
  const respuestas = structuredClone(respuestasValidas)
  respuestas.registrar_devolucion_venta.cambio = false
  const servicio = crearServicioCaja(crearDependenciaRpc(respuestas))

  const resultado = await servicio.registrarDevolucionVenta(
    'jwt',
    VENTA_ID,
    CLAVE_IDEMPOTENCIA,
    'Devolución completa',
  )

  assert.equal(resultado.cambio, false)
  assert.equal(resultado.devolucion.id, DEVOLUCION_ID)
})

test('acepta null solo cuando no existe una devolución registrada', async () => {
  const servicio = crearServicioCaja(crearDependenciaRpc(respuestasValidas))

  const resultado = await servicio.obtenerEstadoDevolucionVenta(
    'jwt',
    VENTA_ID,
  )

  assert.equal(resultado.devolucion_registrada, false)
  assert.equal(resultado.devolucion, null)
})

test('conserva importes numeric serializados como texto decimal', async () => {
  const respuestas = structuredClone(respuestasValidas)
  respuestas.obtener_estado_devolucion_venta = crearEstadoConDevolucion()
  respuestas.obtener_estado_devolucion_venta.total = '50.00'
  respuestas.obtener_estado_devolucion_venta.devolucion.importe_devuelto =
    '50.00'
  respuestas.registrar_devolucion_venta.devolucion.importe_devuelto = '50.00'
  respuestas.registrar_devolucion_venta.devolucion.variacion_efectivo = '-50.00'
  const servicio = crearServicioCaja(crearDependenciaRpc(respuestas))

  const estado = await servicio.obtenerEstadoDevolucionVenta('jwt', VENTA_ID)
  const registro = await servicio.registrarDevolucionVenta(
    'jwt',
    VENTA_ID,
    CLAVE_IDEMPOTENCIA,
    'Devolución completa',
  )

  assert.equal(estado.total, '50.00')
  assert.equal(estado.devolucion.importe_devuelto, '50.00')
  assert.equal(registro.devolucion.variacion_efectivo, '-50.00')
})

test('rechaza cada campo obligatorio ausente en el estado de devolución', async () => {
  const camposPrincipales = [
    'venta_id',
    'estado_venta',
    'total',
    'tiene_ingreso_caja',
    'devolucion_registrada',
    'devolucion',
  ]
  const camposDevolucion = [
    'id',
    'caja_turno_id',
    'importe_devuelto',
    'usuario_id',
    'motivo',
    'fecha_movimiento',
  ]

  for (const campo of camposPrincipales) {
    const respuesta = crearEstadoConDevolucion()
    delete respuesta[campo]
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ obtener_estado_devolucion_venta: respuesta }),
    )

    await assert.rejects(
      servicio.obtenerEstadoDevolucionVenta('jwt', VENTA_ID),
      /formato inválido/i,
    )
  }

  for (const campo of camposDevolucion) {
    const respuesta = crearEstadoConDevolucion()
    delete respuesta.devolucion[campo]
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ obtener_estado_devolucion_venta: respuesta }),
    )

    await assert.rejects(
      servicio.obtenerEstadoDevolucionVenta('jwt', VENTA_ID),
      /formato inválido/i,
    )
  }
})

test('rechaza cada campo obligatorio ausente en el registro de devolución', async () => {
  const camposPrincipales = ['cambio', 'devolucion']
  const camposDevolucion = [
    'id',
    'venta_id',
    'caja_turno_id',
    'importe_devuelto',
    'variacion_efectivo',
    'usuario_id',
    'motivo',
    'fecha_movimiento',
  ]

  for (const campo of camposPrincipales) {
    const respuesta = structuredClone(
      respuestasValidas.registrar_devolucion_venta,
    )
    delete respuesta[campo]
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ registrar_devolucion_venta: respuesta }),
    )

    await assert.rejects(
      servicio.registrarDevolucionVenta(
        'jwt',
        VENTA_ID,
        CLAVE_IDEMPOTENCIA,
        'Devolución completa',
      ),
      /formato inválido/i,
    )
  }

  for (const campo of camposDevolucion) {
    const respuesta = structuredClone(
      respuestasValidas.registrar_devolucion_venta,
    )
    delete respuesta.devolucion[campo]
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ registrar_devolucion_venta: respuesta }),
    )

    await assert.rejects(
      servicio.registrarDevolucionVenta(
        'jwt',
        VENTA_ID,
        CLAVE_IDEMPOTENCIA,
        'Devolución completa',
      ),
      /formato inválido/i,
    )
  }
})

test('rechaza objetos vacíos, null y tipos incorrectos en devoluciones', async () => {
  const estadosInvalidos = [
    { ...crearEstadoConDevolucion(), total: null },
    { ...crearEstadoConDevolucion(), venta_id: CAJA_ID },
    { ...crearEstadoConDevolucion(), devolucion: {} },
    { ...crearEstadoConDevolucion(), devolucion: null },
    {
      ...crearEstadoConDevolucion(),
      devolucion: {
        ...crearEstadoConDevolucion().devolucion,
        importe_devuelto: [],
      },
    },
    {
      ...crearEstadoConDevolucion(),
      devolucion: {
        ...crearEstadoConDevolucion().devolucion,
        fecha_movimiento: 'fecha-invalida',
      },
    },
  ]

  for (const respuesta of estadosInvalidos) {
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ obtener_estado_devolucion_venta: respuesta }),
    )
    await assert.rejects(
      servicio.obtenerEstadoDevolucionVenta('jwt', VENTA_ID),
      /formato inválido/i,
    )
  }

  const registrosInvalidos = [
    { cambio: true, devolucion: {} },
    {
      ...structuredClone(respuestasValidas.registrar_devolucion_venta),
      cambio: 'true',
    },
    {
      ...structuredClone(respuestasValidas.registrar_devolucion_venta),
      devolucion: null,
    },
    {
      ...structuredClone(respuestasValidas.registrar_devolucion_venta),
      devolucion: {
        ...respuestasValidas.registrar_devolucion_venta.devolucion,
        motivo: null,
      },
    },
    {
      ...structuredClone(respuestasValidas.registrar_devolucion_venta),
      devolucion: {
        ...respuestasValidas.registrar_devolucion_venta.devolucion,
        venta_id: CAJA_ID,
      },
    },
    {
      ...structuredClone(respuestasValidas.registrar_devolucion_venta),
      devolucion: {
        ...respuestasValidas.registrar_devolucion_venta.devolucion,
        variacion_efectivo: {},
      },
    },
  ]

  for (const respuesta of registrosInvalidos) {
    const servicio = crearServicioCaja(
      crearDependenciaRpc({ registrar_devolucion_venta: respuesta }),
    )
    await assert.rejects(
      servicio.registrarDevolucionVenta(
        'jwt',
        VENTA_ID,
        CLAVE_IDEMPOTENCIA,
        'Devolución completa',
      ),
      /formato inválido/i,
    )
  }
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

  const servicioDevolucion = crearServicioCaja(
    crearDependenciaRpc({
      obtener_estado_devolucion_venta: {
        venta_id: VENTA_ID,
        estado_venta: 'anulada',
        tiene_ingreso_caja: true,
        devolucion_registrada: true,
        devolucion: null,
      },
    }),
  )

  await assert.rejects(
    servicioDevolucion.obtenerEstadoDevolucionVenta('jwt', VENTA_ID),
    /formato inválido/i,
  )
})

test('propaga los errores de negocio de una devolución', async () => {
  const servicio = crearServicioCaja(
    crearDependenciaRpc({
      registrar_devolucion_venta: {
        error: {
          code: '23514',
          message: 'La Venta debe estar anulada antes de registrar la devolucion.',
        },
      },
    }),
  )

  await assert.rejects(
    servicio.registrarDevolucionVenta(
      'jwt',
      VENTA_ID,
      CLAVE_IDEMPOTENCIA,
      'Devolución completa',
    ),
    (error) =>
      error instanceof ErrorServicioCaja &&
      error.codigo === '23514' &&
      /debe estar anulada/.test(error.detalle),
  )
})
