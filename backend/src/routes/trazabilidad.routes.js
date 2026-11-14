import { Router } from 'express'
import { consultarTrazabilidadQr } from '../services/operaciones.service.js'

const router = Router()

router.get('/lotes/:token', async (req, res) => {
  try {
    const resultado = await consultarTrazabilidadQr(req.params.token)
    if (!resultado) return res.status(404).json({ ok: false, message: 'QR no válido o inactivo.' })
    return res.json({ ok: true, ...resultado })
  } catch {
    return res.status(500).json({ ok: false, message: 'No fue posible consultar la trazabilidad.' })
  }
})

export default router
