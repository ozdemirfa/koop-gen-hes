import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { malzemeTeslimService } from '../services/malzemeTeslim.service'
import { catchAsync } from '../utils/catchAsync'

export const getMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.list(req.query as Record<string, any>)
  res.json({ success: true, ...data })
})

export const getMalzemeTeslimById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await malzemeTeslimService.delete(req.params.id)
  res.json({ success: true })
})
