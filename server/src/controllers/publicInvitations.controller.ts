/**
 * Public (auth gerektirmeyen) davet endpoint'leri.
 * Mount: /api/invitations
 * Korumalar: IP rate-limit middleware (5/dk + 30/saat) + token-bazlı doğrulama.
 */

import { Request, Response } from 'express'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'
import { invitationService } from '../services/invitation.service'
import { invitationAcceptByTokenSchema } from '../schemas/invitation.schema'

export const previewInvitation = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params
  if (!token) throw ApiError.badRequest('token gerekli')
  const data = await invitationService.getPreviewByToken(token)
  res.json({ success: true, data })
})

export const acceptInvitationByToken = catchAsync(async (req: Request, res: Response) => {
  const body = invitationAcceptByTokenSchema.parse(req.body)
  const data = await invitationService.acceptInvitationByToken(body.token, body.otp, body.password)
  res.json({ success: true, data })
})
