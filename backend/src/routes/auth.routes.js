import { Router } from 'express'
import { autenticarUsuario } from '../middlewares/autenticacion.js'

const router = Router()

router.get('/me', autenticarUsuario, (req, res) => {
  // La respuesta demuestra únicamente que existe una identidad válida. Los
  // roles y permisos del usuario se resolverán en tareas posteriores.
  res.status(200).json({
    ok: true,
    usuario: {
      id: req.usuario.id,
      email: req.usuario.email ?? null,
    },
  })
})

export default router
