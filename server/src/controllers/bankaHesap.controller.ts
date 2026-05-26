import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { bankaHesapService } from '../services/bankaHesap.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getHesaplar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.listHesaplar(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createHesap = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.createHesap(req.body)
  res.status(201).json({ success: true, data })
})

export const updateHesap = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.updateHesap(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const getHareketler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.listHareketler(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createHareket = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.createHareket(req.body)
  res.status(201).json({ success: true, data })
})

export const esleHareket = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.esle(req.params.id, req.body.eslesen_cari_hareket_id, extractProjeId(req))
  res.json({ success: true, data })
})
