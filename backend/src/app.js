import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'

const app = express()

// El navegador solo podrá consumir la API desde el origen autorizado. La
// variable permite cambiarlo en despliegues futuros sin modificar este archivo.
const origenesPermitidos = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
]

app.use(
  cors({
    origin: origenesPermitidos,
  }),
)

// Permite que las rutas futuras reciban cuerpos JSON y los expone en req.body.
app.use(express.json())

// Este endpoint mínimo permite comprobar que la API está disponible antes de
// incorporar módulos de negocio o conexiones con servicios externos.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    message: 'API de ECOFARM funcionando',
  })
})

// Las rutas de autenticación validan identidad. La autorización mediante roles
// y permisos se incorporará posteriormente en una capa separada.
app.use('/api/auth', authRoutes)

export default app
