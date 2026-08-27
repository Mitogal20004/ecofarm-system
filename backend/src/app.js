import express from 'express'

const app = express()

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

export default app
