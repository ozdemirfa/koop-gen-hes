import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { adminService } from '../services/admin.service'
import { catchAsync } from '../utils/catchAsync'

export const listUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await adminService.listUsers()
  res.json({ success: true, data })
})

export const inviteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.inviteUser(req.body)
  res.status(201).json({ success: true, data })
})

export const updateGlobalRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.updateGlobalRole(req.params.id, req.body.role)
  res.json({ success: true, data })
})

export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.deleteUser(req.params.id)
  res.json({ success: true, data })
})
