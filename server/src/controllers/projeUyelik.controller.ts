import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { projeUyelikService } from '../services/projeUyelik.service'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'

export const listMembers = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await projeUyelikService.listMembers(req.params.projeId)
  res.json({ success: true, data })
})

export const upsertMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await projeUyelikService.upsertMember(
    req.params.projeId,
    req.body.user_id,
    req.body.rol
  )
  res.status(201).json({ success: true, data })
})

export const updateMemberRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await projeUyelikService.upsertMember(
    req.params.projeId,
    req.params.userId,
    req.body.rol
  )
  res.json({ success: true, data })
})

export const removeMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await projeUyelikService.removeMember(req.params.projeId, req.params.userId)
  res.json({ success: true, data })
})

export const getMyRole = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw ApiError.unauthorized()

  // Global admin tüm projelere admin yetkisiyle sahip
  if (req.userRole === 'admin') {
    res.json({ success: true, data: { rol: 'admin' } })
    return
  }

  const rol = await projeUyelikService.getMyRole(req.user.id, req.params.projeId)
  res.json({ success: true, data: { rol } })
})
