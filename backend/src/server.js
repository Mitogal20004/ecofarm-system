import 'dotenv/config'
import app from './app.js'

// Render podrá asignar PORT en producción; 3000 facilita la ejecución local
// cuando esa variable de entorno todavía no existe.
const puerto = process.env.PORT || 3000

app.listen(puerto, () => {
  console.log(`API de ECOFARM ejecutándose en http://localhost:${puerto}`)
})
