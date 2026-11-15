export const PAISES_TELEFONO = [
  { codigo: '+502', iso: 'gt', nombre: 'Guatemala', nitMin: 7, nitMax: 9, nitNumerico: true },
  { codigo: '+52', iso: 'mx', nombre: 'México', nitMin: 12, nitMax: 13 },
  { codigo: '+1', iso: 'us', nombre: 'Estados Unidos', nitMin: 9, nitMax: 9, nitNumerico: true },
  { codigo: '+34', iso: 'es', nombre: 'España', nitMin: 9, nitMax: 9 },
  { codigo: '+503', iso: 'sv', nombre: 'El Salvador', nitMin: 9, nitMax: 14, nitNumerico: true },
  { codigo: '+504', iso: 'hn', nombre: 'Honduras', nitMin: 14, nitMax: 14, nitNumerico: true },
  { codigo: '+505', iso: 'ni', nombre: 'Nicaragua', nitMin: 14, nitMax: 14, nitNumerico: true },
  { codigo: '+506', iso: 'cr', nombre: 'Costa Rica', nitMin: 9, nitMax: 9, nitNumerico: true },
  { codigo: '+507', iso: 'pa', nombre: 'Panamá', nitMin: 8, nitMax: 12, nitNumerico: true },
]

export const obtenerUrlBandera = (iso) => `https://flagcdn.com/${iso}.svg`

export function separarTelefono(telefono) {
  const valor = String(telefono ?? '').replace(/[^\d+]/g, '')
  const pais = PAISES_TELEFONO.find((opcion) => valor.startsWith(opcion.codigo))

  if (!pais) {
    return { codigo: PAISES_TELEFONO[0].codigo, local: valor.replace(/^\+/, '') }
  }

  return {
    codigo: pais.codigo,
    local: valor.slice(pais.codigo.length).replace(/^\+/, ''),
  }
}
