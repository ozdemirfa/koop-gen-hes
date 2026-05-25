import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { firmaService } from '../services/firma.service'
import { catchAsync } from '../utils/catchAsync'

export const getFirmalar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await firmaService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getFirmaById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.getById(req.params.id)
  res.json({ success: true, data })
})

export const getStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const projeId = req.query.proje_id as string
  if (!projeId) {
    return res.status(400).json({ success: false, error: 'proje_id gereklidir' })
  }
  const data = await firmaService.getStats(projeId)
  res.json({ success: true, data })
})

export const getFirmaStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const projeId = req.query.proje_id as string
  if (!projeId) {
    return res.status(400).json({ success: false, error: 'proje_id gereklidir' })
  }
  const data = await firmaService.getIndividualStats(id, projeId)
  res.json({ success: true, data })
})

export const createFirma = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateFirma = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const getCariEkstre = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // Sprint revizyon-bugfix-paketi B2 (2026-05-25, P0 veri sizintisi):
  // req.query servise iletilmiyordu; getCariEkstre proje_id filtresi
  // bekliyordu ama firmaService cagrisinda atlandigi icin bir firmaya bagli
  // TUM projelerin cari hareketleri sizdiriliyordu. Multi-tenant ihlali.
  // Artik query iletilir + servis tarafinda proje_id zorunlu kilinir.
  const data = await firmaService.getCariEkstre(req.params.id, req.query as Record<string, any>)
  res.json({ success: true, data })
})
