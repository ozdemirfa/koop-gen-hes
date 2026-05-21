/**
 * Owner/manager perspektifinden davet endpoint'leri.
 * Mount: /api/projeler/:projeId/invitations
 * Auth: requireProjectAccess (manager+ create/cancel, user+ read).
 */

import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'
import { invitationService } from '../services/invitation.service'
import {
  invitationCreateSchema,
  invitationListQuerySchema,
} from '../schemas/invitation.schema'

export const createInvitation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projeId } = req.params
  if (!projeId) throw ApiError.badRequest('proje_id gerekli')

  const body = invitationCreateSchema.parse(req.body)
  const invitedBy = req.user?.id
  if (!invitedBy) throw ApiError.unauthorized('Kimlik doğrulanamadı')
  const invitedByName = req.user?.email ?? 'koopGenHes'

  const data = await invitationService.createInvitation({
    projeId,
    email: body.email,
    invitedRole: body.projectRole,
    invitedBy,
    invitedByName,
  })
  res.status(201).json({ success: true, data })
})

export const listInvitations = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projeId } = req.params
  if (!projeId) throw ApiError.badRequest('proje_id gerekli')
  const q = invitationListQuerySchema.parse(req.query)
  const data = await invitationService.listForProject(projeId, q.status)
  res.json({ success: true, data })
})

export const cancelInvitation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projeId, id } = req.params
  if (!projeId || !id) throw ApiError.badRequest('proje_id ve davet id gerekli')
  await invitationService.cancelInvitation(id, projeId)
  res.json({ success: true })
})
