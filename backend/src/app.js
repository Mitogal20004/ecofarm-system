import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'
import cajaRoutes from './routes/caja.routes.js'
import clientesRoutes from './routes/clientes.routes.js'
import cuentasClientesRoutes from './routes/cuentas-clientes.routes.js'
import cotizacionesRoutes from './routes/cotizaciones.routes.js'
import facturasFelRoutes from './routes/facturas-fel.routes.js'
import inventarioRoutes from './routes/inventario.routes.js'
import productosRoutes from './routes/productos.routes.js'
import reportesRoutes from './routes/reportes.routes.js'
import rolesRoutes from './routes/roles.routes.js'
import usuariosRoutes from './routes/usuarios.routes.js'
import ventasRoutes from './routes/ventas.routes.js'
import operacionesRoutes from './routes/operaciones.routes.js'
import trazabilidadRoutes from './routes/trazabilidad.routes.js'
import {
  agregarCabecerasSeguras,
  agregarIdentidadSolicitud,
  rechazarHttpInseguro,
} from './middlewares/seguridad.js'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)

app.use(agregarIdentidadSolicitud)
app.use(agregarCabecerasSeguras)
app.use(rechazarHttpInseguro)

// El navegador solo podrá consumir la API desde el origen autorizado. La
// variable permite cambiarlo en despliegues futuros sin modificar este archivo.
const valorOrigenes = process.env.FRONTEND_URL || 'http://localhost:5173'
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL es obligatorio en producción.')
}

const origenesPermitidos = valorOrigenes
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean)

for (const origen of origenesPermitidos) {
  const url = new URL(origen)
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    url.hostname !== 'localhost'
  ) {
    throw new Error('FRONTEND_URL debe utilizar HTTPS en producción.')
  }
}

app.use(
  cors({
    origin: (origen, callback) => {
      // Las solicitudes sin Origin pueden ser health checks o clientes no
      // browser; CORS no debe bloquearlas, pero tampoco debe reflejar orígenes
      // desconocidos.
      if (!origen || origenesPermitidos.includes(origen)) {
        return callback(null, true)
      }

      console.warn('[cors] Origen rechazado.', {
        origen,
        permitidos: origenesPermitidos,
      })
      return callback(new Error('Origen no permitido por CORS'))
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    maxAge: 600,
  }),
)

// Permite que las rutas futuras reciban cuerpos JSON y los expone en req.body.
app.use(express.json({ limit: '256kb', strict: true }))

// Este endpoint mínimo permite comprobar que la API está disponible antes de
// incorporar módulos de negocio o conexiones con servicios externos.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    message: 'API de ECOFARM funcionando',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/caja', cajaRoutes)
app.use('/api/clientes', clientesRoutes)
app.use('/api/cuentas-clientes', cuentasClientesRoutes)
app.use('/api/cotizaciones', cotizacionesRoutes)
app.use('/api/facturas-fel', facturasFelRoutes)
app.use('/api/inventario', inventarioRoutes)
app.use('/api/productos', productosRoutes)
app.use('/api/reportes', reportesRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/ventas', ventasRoutes)
app.use('/api/operaciones', operacionesRoutes)
app.use('/api/trazabilidad', trazabilidadRoutes)

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Recurso no encontrado' })
})

app.use((error, req, res, _next) => {
  // Nunca se envían stack traces, mensajes de proveedores ni detalles SQL al
  // cliente. El identificador permite correlacionar el error en los logs.
  console.error('Error no controlado en la API', {
    requestId: req.idSolicitud,
    nombre: error?.name,
    mensaje: error?.message,
  })

  if (res.headersSent) return

  res.status(error?.type === 'entity.too.large' ? 413 : 500).json({
    ok: false,
    message:
      error?.type === 'entity.too.large'
        ? 'La solicitud es demasiado grande.'
        : 'No fue posible completar la solicitud.',
  })
})

export default app
