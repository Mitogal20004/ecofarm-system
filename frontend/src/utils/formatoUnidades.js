export const formatearManojosPorUnidad = (cantidad) => {
  const cantidadNumerica = Number(cantidad)
  const unidad = cantidadNumerica === 1 ? 'manojo' : 'manojos'

  return `${cantidadNumerica} ${unidad} por unidad`
}
