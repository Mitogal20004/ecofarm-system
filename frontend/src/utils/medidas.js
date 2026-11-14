export const UNIDADES_LONGITUD = [
  { valor: 'mm', etiqueta: 'Milímetros (mm)', factorCm: 0.1 },
  { valor: 'cm', etiqueta: 'Centímetros (cm)', factorCm: 1 },
  { valor: 'm', etiqueta: 'Metros (m)', factorCm: 100 },
  { valor: 'in', etiqueta: 'Pulgadas (in)', factorCm: 2.54 },
  { valor: 'ft', etiqueta: 'Pies (ft)', factorCm: 30.48 },
]

export function obtenerUnidadLongitud(valor) {
  return UNIDADES_LONGITUD.find((unidad) => unidad.valor === valor) ?? UNIDADES_LONGITUD[1]
}

export function convertirACentimetros(valor, unidad) {
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) return null

  const centimetros = numero * obtenerUnidadLongitud(unidad).factorCm
  return Number.isSafeInteger(Math.round(centimetros)) && Math.round(centimetros) > 0
    ? Math.round(centimetros)
    : null
}

export function formatearLongitudCentimetros(valor) {
  const centimetros = Number(valor)
  if (!Number.isFinite(centimetros)) return '—'
  return `${centimetros} cm`
}
