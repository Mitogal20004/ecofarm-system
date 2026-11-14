const valorApiUrl = import.meta.env.VITE_API_URL
const esProduccion = import.meta.env.MODE === 'production'

let apiUrlValida = false
try {
  const url = new URL(valorApiUrl)
  apiUrlValida =
    (url.protocol === 'https:' || (!esProduccion && url.hostname === 'localhost')) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
} catch {
  apiUrlValida = false
}

if (!apiUrlValida) {
  throw new Error('VITE_API_URL debe ser una URL HTTPS válida.')
}

export const apiUrl = valorApiUrl.replace(/\/+$/, '')
