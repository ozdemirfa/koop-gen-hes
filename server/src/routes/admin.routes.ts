import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { resetPasswordSchema, setUserRoleSchema } from '../schemas/admin.schema'
import { yetkiliInvitationCreateSchema } from '../schemas/invitation.schema'
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

// Sprint yetkili-role-system (PR-A, 2026-05-22):
//   PATCH /users/:id/role yeniden aktif — yetkili/staff/null atama akışı.
//   Body: { role: 'yetkili' | 'staff' | null } — admin reddedilir.
//   Caller kendi rolünü değiştiremez (controller'da self-check).
//   PR-D'deki 410 davranışı kaldırıldı.
router.patch(
  '/users/:id/role',
  requireRole('admin'),
  validate({ body: setUserRoleSchema }),
  adminController.setUserRole,
)

// Sprint yetkili-role-system (PR-A): admin yetkili daveti.
//   Body: { email }
//   Akış: yeni kullanıcı + token + OTP + mail → kabul edince user_roles=yetkili.
router.post(
  '/invitations/yetkili',
  requireRole('admin'),
  validate({ body: yetkiliInvitationCreateSchema }),
  adminController.createYetkiliInvitation,
)

export default router
