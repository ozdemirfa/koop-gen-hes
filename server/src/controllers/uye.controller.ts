import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { uyeService } from '../services/uye.service'
import { aidatService } from '../services/aidat.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper.
// SEC-2 (2026-06-02): X-Active-Project-Id header fallback'i eklendi —
//   requireProjectAccess ile AYNI çözüm sırası (body → query → params → header).
//   Aksi halde yalnız header gönderen client'larda middleware geçerken controller
//   400 verir veya IDOR guard'ı middleware'in doğruladığından farklı projeye bakar.
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const headerRaw = req.headers?.['x-active-project-id']
  const fromHeader = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw
  const raw = fromBody ?? fromQuery ?? fromParams ?? fromHeader
  return typeof raw === 'string' ? raw : ''
}

export const getUyes = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await uyeService.list(req.query)
  res.json({ success: true, ...result })
})

export const getUyeById = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await uyeService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const createUye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await uyeService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateUye = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await uyeService.update(req.params.id, req.body, extractProjeId(req), req.user?.id)
  res.json({ success: true, data })
})

export const deleteUye = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  await uyeService.delete(req.params.id, extractProjeId(req))
  res.json({ success: true, message: 'Üye pasif yapıldı' })
})

export const getUyeAidatlar = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await uyeService.getAidatlar(req.params.id, req.query)
  res.json({ success: true, data })
})

export const bulkPayment = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await aidatService.recordBulkPayment(req.params.id, req.body, req.user?.id)
  res.json({ success: true, data })
})

export const matchPaymentsFIFO = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const { proje_id } = req.query
  const data = await uyeService.matchPaymentsFIFO(req.params.id, proje_id as string, req.user?.id)
  res.json({ success: true, data })
})

