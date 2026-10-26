import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'clave-publica-pruebas'
process.env.SUPABASE_SECRET_KEY ||= 'clave-secreta-pruebas'

const { default: router } = await import('../../src/routes/caja.routes.js')

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

const permisos = (...codigos) => ({
  autorizacion: {
    permisos: codigos.map((codigo) => ({ codigo })),
  },
})

test('expone las seis rutas REST con autenticación y autorización', () => {
  const rutas = router.stack.filter((capa) => capa.route)
  const contratos = rutas.map((capa) => ({
    ruta: capa.route.path,
    metodo: Object.keys(capa.route.methods)[0],
  }))

  assert.deepEqual(contratos, [
    { ruta: '/abrir', metodo: 'post' },
    { ruta: '/actual/resumen', metodo: 'get' },
    { ruta: '/actual', metodo: 'get' },
    { ruta: '/:cajaId/cerrar', metodo: 'post' },
    { ruta: '/', metodo: 'get' },
    { ruta: '/:cajaId', metodo: 'get' },
  ])

  for (const capa of rutas) {
    const middlewares = capa.route.stack.map((entrada) => entrada.handle)
    assert.equal(middlewares[0].name, 'autenticarUsuario')
    assert.equal(middlewares[1].name, 'cargarAutorizacion')
  }
})

test('abrir exige caja.operar', () => {
  const ruta = router.stack.find((capa) => capa.route?.path === '/abrir')
  const autorizar = ruta.route.stack[2].handle
  const denegada = crearRespuesta()
  let accesoOperador = false

  autorizar(permisos('caja.ver'), denegada, () => {})
  autorizar(permisos('caja.operar'), crearRespuesta(), () => {
    accesoOperador = true
  })

  assert.equal(denegada.estado, 403)
  assert.equal(accesoOperador, true)
})

test('consulta e historial aceptan caja.operar o caja.ver', () => {
  const rutas = router.stack.filter(
    (capa) =>
      capa.route &&
      ['/', '/actual', '/actual/resumen', '/:cajaId'].includes(
        capa.route.path,
      ),
  )

  for (const ruta of rutas) {
    const autorizar = ruta.route.stack[2].handle
    let accesoOperador = false
    let accesoConsulta = false
    const denegada = crearRespuesta()

    autorizar(permisos('caja.operar'), crearRespuesta(), () => {
      accesoOperador = true
    })
    autorizar(permisos('caja.ver'), crearRespuesta(), () => {
      accesoConsulta = true
    })
    autorizar(permisos('venta.ver'), denegada, () => {})

    assert.equal(accesoOperador, true)
    assert.equal(accesoConsulta, true)
    assert.equal(denegada.estado, 403)
  }
})

test('cerrar acepta caja.operar o caja.supervisar', () => {
  const ruta = router.stack.find(
    (capa) => capa.route?.path === '/:cajaId/cerrar',
  )
  const autorizar = ruta.route.stack[2].handle
  let accesoOperador = false
  let accesoSupervisor = false
  const denegada = crearRespuesta()

  autorizar(permisos('caja.operar'), crearRespuesta(), () => {
    accesoOperador = true
  })
  autorizar(permisos('caja.supervisar'), crearRespuesta(), () => {
    accesoSupervisor = true
  })
  autorizar(permisos('caja.ver'), denegada, () => {})

  assert.equal(accesoOperador, true)
  assert.equal(accesoSupervisor, true)
  assert.equal(denegada.estado, 403)
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
