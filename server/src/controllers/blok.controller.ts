import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { blokService } from '../services/uye.service'
import { catchAsync } from '../utils/catchAsync'

export const getBloklar = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await blokService.list()
  res.json({ success: true, data })
})

export const createBlok = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await blokService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateBlok = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await blokService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteBlok = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  await blokService.delete(req.params.id)
  res.json({ success: true, message: 'Blok silindi' })
})
