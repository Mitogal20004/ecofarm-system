import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La opción de proxy se utiliza únicamente en el servidor de desarrollo.
// Permite probar el frontend local contra la API desplegada sin cambiar
// los orígenes permitidos por CORS en producción.
// Para usarlo, iniciar Vite con VITE_API_URL=http://localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target:
          process.env.EFARM_DEV_API_TARGET ||
          'https://ecofarm-backend-woy7.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
