import { useEffect, useState } from 'react'
import './App.css'

// Vite expone al frontend únicamente las variables cuyo nombre empieza con VITE_.
const apiUrl = import.meta.env.VITE_API_URL

function App() {
  const [estadoConexion, setEstadoConexion] = useState(
    'Comprobando conexión con el servidor...',
  )
  const [mensajeApi, setMensajeApi] = useState('')

  // La comprobación se ejecuta al cargar la aplicación porque solo necesitamos
  // verificar una vez que React puede comunicarse con la API de desarrollo.
  useEffect(() => {
    const comprobarBackend = async () => {
      try {
        const respuesta = await fetch(`${apiUrl}/api/health`)

        if (!respuesta.ok) {
          throw new Error(`El servidor respondió con HTTP ${respuesta.status}`)
        }

        const datos = await respuesta.json()

        setEstadoConexion('Backend conectado correctamente')
        setMensajeApi(datos.message)
      } catch (error) {
        console.error('Error al comprobar la conexión con el backend:', error)
        setEstadoConexion('No fue posible conectar con el backend')
        setMensajeApi('')
      }
    }

    comprobarBackend()
  }, [])

  return (
    <main id="center">
      <h1>Prueba de conexión</h1>
      <p>{estadoConexion}</p>
      {mensajeApi && <p>{mensajeApi}</p>}
    </main>
  )
}

export default App
