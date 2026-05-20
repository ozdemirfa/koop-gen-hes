import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { adminService } from '../services/admin.service'
import { passwordResetService } from '../services/passwordReset.service'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'

export const listUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await adminService.listUsers()
  res.json({ success: true, data })
})

/**
 * POST /api/admin/users/invite
 * Body: { email, projeId, projectRole: 'manager' | 'user' }
 * Auth: requireProjectAccess('owner') — caller hedef projede owner olmalı.
 */
export const inviteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.inviteUser(req.body)
  res.status(201).json({ success: true, data })
})

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
