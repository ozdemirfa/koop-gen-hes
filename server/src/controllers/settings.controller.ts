import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { settingsService } from '../services/settings.service'
import { catchAsync } from '../utils/catchAsync'

export const getBirimler = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await settingsService.getBirimler()
  res.json({ success: true, data })
})

export const createBirim = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await settingsService.createBirim(req.body)
  res.status(201).json({ success: true, data })
})

export const deleteBirim = catchAsync(async (req: AuthRequest, res: Response) => {
  await settingsService.deleteBirim(req.params.id)
  res.json({ success: true, message: 'Birim silindi' })
})

export const getPozlar = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await settingsService.getPozlar()
  res.json({ success: true, data })
})

export const createPoz = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await settingsService.createPoz(req.body)
  res.status(201).json({ success: true, data })
})

export const updatePoz = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await settingsService.updatePoz(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deletePoz = catchAsync(async (req: AuthRequest, res: Response) => {
  await settingsService.deletePoz(req.params.id)
  res.json({ success: true, message: 'Poz silindi' })
})
