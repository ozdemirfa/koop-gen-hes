import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { yonetimEkibiService } from '../services/yonetimEkibi.service'
import { catchAsync } from '../utils/catchAsync'

// Sprint yonetim-ekibi (2026-05-30): Yönetim ekibi CRUD + ödeme controller'ı.

export const listYonetim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await yonetimEkibiService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createYonetim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await yonetimEkibiService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateYonetim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await yonetimEkibiService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteYonetim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // proje_id query string'inden gelir; requireProjectAccess middleware doğrular,
  // service tekrar eşleştirir (defense in depth).
  const projeId = String((req.query as any).proje_id || '')
  const data = await yonetimEkibiService.remove(req.params.id, projeId)
  res.json({ success: true, data })
})

export const createYonetimPayment = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await yonetimEkibiService.createPayment(req.body)
  res.status(201).json({ success: true, data })
})
