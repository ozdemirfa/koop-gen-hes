import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { faturaService } from '../services/fatura.service'
import { catchAsync } from '../utils/catchAsync'

export const getFaturalar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await faturaService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getFaturaById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await faturaService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await faturaService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await faturaService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await faturaService.delete(req.params.id)
  res.json({ success: true, message: 'Fatura silindi' })
})
