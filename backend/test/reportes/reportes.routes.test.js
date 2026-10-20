import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const { default: router } = await import(
  '../../src/routes/reportes.routes.js'
)

const rutasEsperadas = new Set([
  '/ventas',
  '/productos-vendidos',
  '/inventario',
  '/inventario/movimientos',
  '/cotizaciones',
])

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

test('las cinco rutas GET aplican autenticación, autorización y reporte.ver', () => {
  const rutas = router.stack.filter((capa) => capa.route)
  assert.equal(rutas.length, 5)
  assert.deepEqual(
    new Set(rutas.map((capa) => capa.route.path)),
    rutasEsperadas,
  )

  for (const capa of rutas) {
    assert.equal(capa.route.methods.get, true)
    const middlewares = capa.route.stack.map((entrada) => entrada.handle)
    assert.equal(middlewares[0].name, 'autenticarUsuario')
    assert.equal(middlewares[1].name, 'cargarAutorizacion')
    assert.equal(middlewares[2].name, 'verificarPermiso')

    const respuestaDenegada = crearRespuesta()
    let continuoSinPermiso = false
    middlewares[2](
      { autorizacion: { permisos: [{ codigo: 'venta.ver' }] } },
      respuestaDenegada,
      () => {
        continuoSinPermiso = true
      },
    )
    assert.equal(continuoSinPermiso, false)
    assert.equal(respuestaDenegada.estado, 403)

    let continuoConPermiso = false
    middlewares[2](
      { autorizacion: { permisos: [{ codigo: 'reporte.ver' }] } },
      crearRespuesta(),
      () => {
        continuoConPermiso = true
      },
    )
    assert.equal(continuoConPermiso, true)
  }
})

test('la ausencia del Bearer token responde 401 antes del controlador', () => {
  const ruta = router.stack.find((capa) => capa.route)
  const autenticarUsuario = ruta.route.stack[0].handle
  const respuesta = crearRespuesta()
  let continuo = false

  autenticarUsuario(
    { get: () => undefined },
    respuesta,
    () => {
      continuo = true
    },
  )

  assert.equal(continuo, false)
  assert.equal(respuesta.estado, 401)
  assert.equal(respuesta.cuerpo.ok, false)
})
