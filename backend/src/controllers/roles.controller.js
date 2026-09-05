import {
  ErrorServicioRoles,
  listarRolesActivos as listarRolesActivosServicio,
} from '../services/roles.service.js'

export async function listarRolesActivos(req, res) {
  try {
    const resultado = await listarRolesActivosServicio(
      req.autenticacion?.token,
    )

    return res.status(200).json(resultado)
  } catch (error) {
    if (error instanceof ErrorServicioRoles && error.codigo === '42501') {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permiso para realizar esta acción',
      })
    }

    return res.status(500).json({
      ok: false,
      message: 'No fue posible completar la operación solicitada',
    })
  }
}
