import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { faturaService } from '../services/fatura.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26):
//   `proje_id` artık service katmanına explicit geçirilir.
//   Middleware (`requireProjectAccess`) zaten user'ın o projede yetkili olduğunu
//   doğruladı; controller bu değeri `req.query`/`req.body`/`req.params`'tan
//   çıkarıp service'e iletir. Service `.eq('proje_id', projeId)` ile cross-check
//   yapar — saldırgan başka projenin fatura ID'sini gönderse de 404 alır.
function extractProjeId(req: AuthRequest<any, any, any, any>): string | undefined {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : undefined
}

export const getFaturalar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await faturaService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getFaturaById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  const data = await faturaService.getById(req.params.id, projeId ?? '')
  res.json({ success: true, data })
})

export const createFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await faturaService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  const data = await faturaService.update(req.params.id, req.body, projeId ?? '', req.user?.id)
  res.json({ success: true, data })
})

export const deleteFatura = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  await faturaService.delete(req.params.id, projeId ?? '')
  res.json({ success: true, message: 'Fatura silindi' })
})
