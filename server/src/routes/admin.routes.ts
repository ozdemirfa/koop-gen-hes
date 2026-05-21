import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { resetPasswordSchema } from '../schemas/admin.schema'
import * as adminController from '../controllers/admin.controller'

const router = Router()

/**
 * Sprint role-system-modernization (PR-D, 2026-05-20):
 *   Davet ve şifre yenileme akışları artık proje-bazlı —
 *   `requireProjectAccess('owner')` ile guard'lanır (body.projeId üzerinden).
 *   Listeleme ve kullanıcı silme legacy global admin akışı olarak kalır
 *   (PR-E veya legacy cleanup'ta kaldırılır).
 *
 *   PATCH /users/:id/role endpoint'i kaldırıldı (controller 410 dönüyor).
 *   Proje-bazlı rol değişikliği için /api/projeler/:projeId/uyeler/:userId
 *   kullanılır.
 */

// Listeleme + silme legacy global admin only.
// PR-D bu PR'ı çok büyütmemek için listUsers + deleteUser akışını değiştirmedi;
// proje-bazlı kullanıcı listesi artık /api/projeler/:projeId/uyeler endpoint'inden
// alınır. Frontend KullaniciYonetimiPage proje üyeleri için bu endpoint'i kullanır.
router.get('/users', requireRole('admin'), adminController.listUsers)
router.delete('/users/:id', requireRole('admin'), adminController.deleteUser)

// Eski /users/invite kaldırıldı (2026-05-21).
// Yeni davet akışı: POST /api/projeler/:projeId/invitations
// (server/src/routes/invitations.routes.ts)

// POST /api/admin/users/:id/sifre-yenile — owner-only şifre yenileme
//   Body: { projeId, newPassword? }
//   Auth: caller hedef projede owner olmalı; target üye olmalı; target owner olamaz.
router.post(
  '/users/:id/sifre-yenile',
  validate({ body: resetPasswordSchema }),
  requireProjectAccess('owner'),
  adminController.resetUserPassword,
)

// @deprecated — global rol değiştirme PR-D ile kaldırıldı.
// Geriye uyumluluk için route hâlâ erişilebilir ama controller 410 dönüyor.
router.patch('/users/:id/role', requireRole('admin'), adminController.updateGlobalRole)

export default router
