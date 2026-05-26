import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { blokService } from '../services/uye.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getBloklar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await blokService.list(req.query)
  res.json({ success: true, data })
})

export const createBlok = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await blokService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateBlok = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await blokService.update(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const deleteBlok = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  await blokService.delete(req.params.id, extractProjeId(req))
  res.json({ success: true, message: 'Blok silindi' })
})
