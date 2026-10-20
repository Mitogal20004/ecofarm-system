import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const {
  crearControladoresReportes,
  validadoresReportes,
} = await import('../../src/controllers/reportes.controller.js')
const { ErrorServicioReportes } = await import(
  '../../src/services/reportes.service.js'
)

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

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

test('normaliza únicamente los filtros admitidos por cada reporte', () => {
  assert.deepEqual(
    validadoresReportes.crearOpcionesVentas({
      fecha_desde: '2026-10-01',
      fecha_hasta: '2026-10-19',
      cliente_id: UUID_A,
      serie: ' v01 ',
      usuario_id: UUID_B,
    }),
    {
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-19',
      clienteId: UUID_A,
      usuarioId: UUID_B,
      serie: 'V01',
    },
  )

  assert.deepEqual(
    validadoresReportes.crearOpcionesInventario({
      pagina: '2',
      limite: '100',
      busqueda: '  rojo   intenso ',
      longitud_cm: '60',
      clasificacion: ' Premium ',
      estado_stock: ' STOCK_BAJO ',
      activo: 'false',
    }),
    {
      pagina: 2,
      limite: 100,
      busqueda: 'rojo intenso',
      longitudCm: 60,
      clasificacion: 'premium',
      estadoStock: 'stock_bajo',
      activo: false,
    },
  )

  assert.deepEqual(
    validadoresReportes.crearOpcionesMovimientos({
      fecha_desde: '2026-10-01',
      fecha_hasta: '2026-10-19',
      tipo: ' SALIDA ',
      origen: ' ANULACION_VENTA ',
      variante_id: UUID_A,
      usuario_id: UUID_B,
    }),
    {
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-19',
      varianteId: UUID_A,
      tipo: 'salida',
      origen: 'anulacion_venta',
      usuarioId: UUID_B,
    },
  )
})

test('rechaza fechas inexistentes, rangos invertidos y fechas faltantes', () => {
  assert.throws(
    () =>
      validadoresReportes.crearOpcionesVentas({
        fecha_desde: '2026-02-30',
        fecha_hasta: '2026-03-01',
      }),
  )
  assert.throws(
    () =>
      validadoresReportes.crearOpcionesCotizaciones({
        fecha_desde: '2026-10-20',
        fecha_hasta: '2026-10-19',
      }),
  )
  assert.throws(() =>
    validadoresReportes.crearOpcionesProductos({
      fecha_desde: '2026-10-01',
    }),
  )
})

test('rechaza UUID, paginación, límite y filtros desconocidos inválidos', () => {
  assert.throws(() =>
    validadoresReportes.crearOpcionesProductos({
      fecha_desde: '2026-10-01',
      fecha_hasta: '2026-10-19',
      variante_id: 'uuid-invalido',
    }),
  )
  assert.throws(() =>
    validadoresReportes.crearOpcionesInventario({ pagina: '0' }),
  )
  assert.throws(() =>
    validadoresReportes.crearOpcionesInventario({ limite: '101' }),
  )
  assert.throws(() =>
    validadoresReportes.crearOpcionesInventario({ estado: 'agotado' }),
  )
})

test('el controlador entrega al servicio el token y parámetros validados', async () => {
  let llamada = null
  const resultado = {
    resumen: { ingresos_validos: '9007199254740993.01' },
    serie: [],
    filtros: {},
  }
  const controladores = crearControladoresReportes({
    obtenerReporteVentas: async (...argumentos) => {
      llamada = argumentos
      return resultado
    },
  })
  const respuesta = crearRespuesta()

  await controladores.obtenerReporteVentas(
    {
      autenticacion: { token: 'jwt-validado' },
      query: {
        fecha_desde: '2026-10-01',
        fecha_hasta: '2026-10-19',
        serie: 'v01',
      },
    },
    respuesta,
  )

  assert.equal(respuesta.estado, 200)
  assert.equal(respuesta.cuerpo, resultado)
  assert.deepEqual(llamada, [
    'jwt-validado',
    {
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-19',
      serie: 'V01',
    },
  ])
})

test('responde 400 antes de llamar al servicio ante una consulta inválida', async () => {
  let llamadas = 0
  const controladores = crearControladoresReportes({
    obtenerReporteCotizaciones: async () => {
      llamadas += 1
    },
  })
  const respuesta = crearRespuesta()

  await controladores.obtenerReporteCotizaciones(
    {
      autenticacion: { token: 'jwt-validado' },
      query: {
        fecha_desde: '2026-10-20',
        fecha_hasta: '2026-10-19',
      },
    },
    respuesta,
  )

  assert.equal(llamadas, 0)
  assert.equal(respuesta.estado, 400)
  assert.equal(respuesta.cuerpo.ok, false)
})

test('traduce errores PostgreSQL seguros y oculta errores inesperados', async () => {
  const errorPermiso = new ErrorServicioReportes('fallo', {
    code: '42501',
    message: 'detalle SQL que no debe exponerse',
  })
  const errorParametros = new ErrorServicioReportes('fallo', {
    code: '22023',
    message: 'detalle SQL que no debe exponerse',
  })
  const respuestaPermiso = crearRespuesta()
  const respuestaParametros = crearRespuesta()
  const respuestaInesperada = crearRespuesta()
  const controladores = crearControladoresReportes({
    obtenerReporteInventario: async () => {
      throw errorPermiso
    },
    obtenerReporteVentas: async () => {
      throw errorParametros
    },
    listarProductosVendidos: async () => {
      throw new Error('stack y secreto interno')
    },
  })

  await controladores.obtenerReporteInventario(
    { autenticacion: { token: 'jwt' }, query: {} },
    respuestaPermiso,
  )
  await controladores.listarProductosVendidos(
    {
      autenticacion: { token: 'jwt' },
      query: {
        fecha_desde: '2026-10-01',
        fecha_hasta: '2026-10-19',
      },
    },
    respuestaInesperada,
  )
  await controladores.obtenerReporteVentas(
    {
      autenticacion: { token: 'jwt' },
      query: {
        fecha_desde: '2026-10-01',
        fecha_hasta: '2026-10-19',
      },
    },
    respuestaParametros,
  )

  assert.equal(respuestaPermiso.estado, 403)
  assert.equal(
    respuestaPermiso.cuerpo.message,
    'No tiene permiso para realizar esta acción',
  )
  assert.doesNotMatch(
    JSON.stringify(respuestaPermiso.cuerpo),
    /detalle SQL/i,
  )
  assert.equal(respuestaParametros.estado, 400)
  assert.doesNotMatch(
    JSON.stringify(respuestaParametros.cuerpo),
    /detalle SQL/i,
  )
  assert.equal(respuestaInesperada.estado, 500)
  assert.doesNotMatch(
    JSON.stringify(respuestaInesperada.cuerpo),
    /stack|secreto/i,
  )
})
