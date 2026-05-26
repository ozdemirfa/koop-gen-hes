import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { cekService } from '../services/cek.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getCekler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const getCekById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const createCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.update(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const updateCekDurum = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.updateDurum(req.params.id, req.body.durum, extractProjeId(req))
  res.json({ success: true, data })
})

export const payCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.payCheck(req.params.id, req.body.banka_hesap_id, extractProjeId(req))
  res.json({ success: true, data })
})
