import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { inviteUserSchema, updateGlobalRoleSchema } from '../schemas/admin.schema'
import * as adminController from '../controllers/admin.controller'

const router = Router()

// Tüm admin endpoint'leri global admin yetkisi gerektirir.
router.use(requireRole('admin'))

// GET /api/admin/users — auth.users + user_roles + proje üyelik özeti
router.get('/users', adminController.listUsers)

// POST /api/admin/users/invite — davet linki gönder + global rol + proje atamaları
router.post('/users/invite', validate({ body: inviteUserSchema }), adminController.inviteUser)

// PATCH /api/admin/users/:id/role — global rolü değiştir
router.patch('/users/:id/role', validate({ body: updateGlobalRoleSchema }), adminController.updateGlobalRole)

// DELETE /api/admin/users/:id — kullanıcıyı sil (auth.users CASCADE)
router.delete('/users/:id', adminController.deleteUser)

export default router
