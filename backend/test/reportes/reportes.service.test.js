import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const { crearServicioReportes, ErrorServicioReportes } = await import(
  '../../src/services/reportes.service.js'
)

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const respuestasVacias = {
  obtener_reporte_ventas: {
    resumen: {
      operaciones_registradas: 0,
      ingresos_validos: '0.00',
    },
    serie: [],
    filtros: {},
  },
  listar_reporte_productos_vendidos: {
    productos: [],
    paginacion: { pagina: 1, limite: 20, total: 0, total_paginas: 0 },
    filtros: {},
  },
  obtener_reporte_inventario: {
    resumen: { total_manojos: 0 },
    inventario: [],
    paginacion: { pagina: 1, limite: 20, total: 0, total_paginas: 0 },
    filtros: {},
  },
  obtener_reporte_movimientos_inventario: {
    resumen: { movimiento_neto_manojos: 0 },
    movimientos: [],
    paginacion: { pagina: 1, limite: 20, total: 0, total_paginas: 0 },
    filtros: {},
  },
  obtener_reporte_cotizaciones: {
    resumen: { total_cotizaciones: 0 },
    estados: [],
    filtros: {},
  },
}

const crearDependenciaRpc = (respuestas = respuestasVacias) => {
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

test('envía a cada RPC únicamente sus parámetros exactos', async () => {
  const dependencia = crearDependenciaRpc()
  const servicio = crearServicioReportes(dependencia)

  await servicio.obtenerReporteVentas('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
    clienteId: UUID_A,
    serie: 'V01',
    usuarioId: UUID_B,
  })
  await servicio.listarProductosVendidos('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
    pagina: 2,
    limite: 50,
    varianteId: UUID_A,
    presentacionId: UUID_B,
  })
  await servicio.obtenerReporteInventario('jwt', {
    pagina: 3,
    limite: 25,
    busqueda: 'rojo',
    longitudCm: 60,
    clasificacion: 'premium',
    estadoStock: 'stock_bajo',
    activo: true,
  })
  await servicio.obtenerReporteMovimientosInventario('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
    pagina: 4,
    limite: 10,
    busqueda: 'rojo',
    varianteId: UUID_A,
    tipo: 'salida',
    origen: 'venta',
    usuarioId: UUID_B,
  })
  await servicio.obtenerReporteCotizaciones('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
    clienteId: UUID_A,
    serie: 'V01',
    usuarioId: UUID_B,
  })

  assert.deepEqual(dependencia.tokens, ['jwt', 'jwt', 'jwt', 'jwt', 'jwt'])
  assert.deepEqual(dependencia.llamadas, [
    {
      nombre: 'obtener_reporte_ventas',
      parametros: {
        p_fecha_desde: '2026-10-01',
        p_fecha_hasta: '2026-10-19',
        p_cliente_id: UUID_A,
        p_serie: 'V01',
        p_usuario_id: UUID_B,
      },
    },
    {
      nombre: 'listar_reporte_productos_vendidos',
      parametros: {
        p_fecha_desde: '2026-10-01',
        p_fecha_hasta: '2026-10-19',
        p_pagina: 2,
        p_limite: 50,
        p_variante_id: UUID_A,
        p_presentacion_id: UUID_B,
      },
    },
    {
      nombre: 'obtener_reporte_inventario',
      parametros: {
        p_pagina: 3,
        p_limite: 25,
        p_busqueda: 'rojo',
        p_longitud_cm: 60,
        p_clasificacion: 'premium',
        p_estado_stock: 'stock_bajo',
        p_activo: true,
      },
    },
    {
      nombre: 'obtener_reporte_movimientos_inventario',
      parametros: {
        p_fecha_desde: '2026-10-01',
        p_fecha_hasta: '2026-10-19',
        p_pagina: 4,
        p_limite: 10,
        p_busqueda: 'rojo',
        p_variante_id: UUID_A,
        p_tipo: 'salida',
        p_origen: 'venta',
        p_usuario_id: UUID_B,
      },
    },
    {
      nombre: 'obtener_reporte_cotizaciones',
      parametros: {
        p_fecha_desde: '2026-10-01',
        p_fecha_hasta: '2026-10-19',
        p_cliente_id: UUID_A,
        p_serie: 'V01',
        p_usuario_id: UUID_B,
      },
    },
  ])
})

test('conserva respuestas vacías y montos sin conversiones numéricas', async () => {
  const montoExacto = '9007199254740993.01'
  const respuestas = structuredClone(respuestasVacias)
  respuestas.obtener_reporte_ventas.resumen.ingresos_validos = montoExacto
  const dependencia = crearDependenciaRpc(respuestas)
  const servicio = crearServicioReportes(dependencia)

  const ventas = await servicio.obtenerReporteVentas('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
  })
  const productos = await servicio.listarProductosVendidos('jwt', {
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-19',
  })

  assert.equal(ventas.resumen.ingresos_validos, montoExacto)
  assert.deepEqual(ventas.serie, [])
  assert.deepEqual(productos.productos, [])
  assert.equal(productos.paginacion.total, 0)
})

test('propaga el código PostgreSQL sin exponerlo como respuesta HTTP', async () => {
  const dependencia = crearDependenciaRpc({
    obtener_reporte_ventas: {
      data: null,
      error: {
        code: '22023',
        message: 'detalle interno PostgreSQL',
      },
    },
  })
  const servicio = crearServicioReportes(dependencia)

  await assert.rejects(
    servicio.obtenerReporteVentas('jwt', {
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-19',
    }),
    (error) =>
      error instanceof ErrorServicioReportes &&
      error.codigo === '22023' &&
      error.detalle === 'detalle interno PostgreSQL',
  )
})

test('rechaza respuestas de Supabase con formato inesperado', async () => {
  const dependencia = crearDependenciaRpc({ obtener_reporte_inventario: null })
  const servicio = crearServicioReportes(dependencia)

  await assert.rejects(
    servicio.obtenerReporteInventario('jwt', {}),
    /formato inválido/i,
  )
})
