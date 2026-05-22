import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { adminService } from '../services/admin.service'
import { invitationService } from '../services/invitation.service'
import { passwordResetService } from '../services/passwordReset.service'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'

export const listUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await adminService.listUsers()
  res.json({ success: true, data })
})

// inviteUser handler kaldırıldı (2026-05-21).
// Yeni davet akışı: POST /api/projeler/:projeId/invitations
// (server/src/controllers/invitations.controller.ts)

/**
 * @deprecated PR-D ile global rol değiştirme akışı kaldırıldı.
 * Route hâlâ erişilebilir durumda olsa bile controller 410 dönüyor.
 */
export const updateGlobalRole = catchAsync(async (_req: AuthRequest, _res: Response) => {
  throw new ApiError(
    410,
    'Global rol değiştirme PR-D ile kaldırıldı — proje-bazlı rol akışını kullanın',
  )
})

export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.deleteUser(req.params.id)
  res.json({ success: true, data })
})

/**
 * POST /api/admin/users/:id/sifre-yenile
 * Body: { projeId, newPassword? }
 * Auth: requireProjectAccess('owner') (route'da uygulanır).
 *
 * Target üye olmalı, target owner olamaz, caller kendisini yenileyemez.
 */
export const resetUserPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const callerId = req.user?.id
  if (!callerId) throw ApiError.unauthorized()

  const userId = req.params.id
  const { projeId, newPassword } = req.body as { projeId: string; newPassword?: string }

  const data = await passwordResetService.resetUserPassword({
    userId,
    projeId,
    callerId,
    newPassword,
  })
  res.json({ success: true, data })
})

/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * PATCH /api/admin/users/:id/role — admin-only global rol değiştirme.
 * Body: { role: 'yetkili' | 'staff' | null }  (admin reddedilir).
 */
export const setUserRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.id
  const { role } = req.body as { role: 'yetkili' | 'staff' | null }

  if (req.user?.id === targetUserId) {
    // Self-yasak: admin kendi rolünü bu endpoint ile değiştiremez.
    throw ApiError.forbidden('Kendi rolünüzü bu endpoint ile değiştiremezsiniz')
  }

  await adminService.setUserGlobalRole(targetUserId, role)
  res.json({ success: true, data: { id: targetUserId, role } })
})

/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * POST /api/admin/invitations/yetkili — admin-only yetkili daveti.
 * Body: { email }
 */
export const createYetkiliInvitation = catchAsync(async (req: AuthRequest, res: Response) => {
  const invitedBy = req.user?.id
  if (!invitedBy) throw ApiError.unauthorized()
  const { email } = req.body as { email: string }

  const data = await invitationService.createYetkiliInvitation({
    email,
    invitedBy,
    invitedByName: req.user?.email,
  })
  res.status(201).json({ success: true, data })
})
