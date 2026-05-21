/**
 * Kullanıcının kendi pending davetleri için endpoint'ler.
 * Mount: /api/me/invitations
 * Auth: requireAuth (user kendisi için işler).
 */

import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'
import { invitationService } from '../services/invitation.service'

export const listMyInvitations = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
  const data = await invitationService.listPendingForUser(userId)
  res.json({ success: true, data })
})

export const acceptMyInvitation = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
  const { id } = req.params
  if (!id) throw ApiError.badRequest('id gerekli')
  const data = await invitationService.acceptInvitationById(id, userId)
  res.json({ success: true, data })
})

export const rejectMyInvitation = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
  const { id } = req.params
  if (!id) throw ApiError.badRequest('id gerekli')
  const data = await invitationService.rejectInvitationById(id, userId)
  res.json({ success: true, data })
})
