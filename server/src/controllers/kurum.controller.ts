import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { kurumService } from '../services/kurum.service'
import { catchAsync } from '../utils/catchAsync'

// Aktif proje_id çözümü (firma.controller ile aynı kaynak sırası). Kurum owner-bazlı
// olduğundan owner çözümü için proje_id gerekir.
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const header = req.headers?.['x-active-project-id']
  const headerStr = Array.isArray(header) ? header[0] : header
  const raw =
    (req.query?.proje_id ?? req.query?.projeId) ??
    headerStr ??
    (req.body?.proje_id ?? req.body?.projeId)
  return typeof raw === 'string' ? raw.trim() : ''
}

export const getKurumlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await kurumService.list({ ...(req.query as Record<string, any>), proje_id: extractProjeId(req) })
  res.json({ success: true, ...result })
})

export const getKurumById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kurumService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const createKurum = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  if (!projeId) return res.status(400).json({ success: false, error: 'proje_id zorunludur' })
  const data = await kurumService.create(req.body, projeId)
  res.status(201).json({ success: true, data })
})

export const updateKurum = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  if (!projeId) return res.status(400).json({ success: false, error: 'proje_id zorunludur' })
  const data = await kurumService.update(req.params.id, req.body, projeId)
  res.json({ success: true, data })
})

export const deleteKurum = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = extractProjeId(req)
  if (!projeId) return res.status(400).json({ success: false, error: 'proje_id zorunludur' })
  const data = await kurumService.delete(req.params.id, projeId)
  res.json({ success: true, data })
})

export const getKurumCariEkstre = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kurumService.getCariEkstre(req.params.id, req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createKurumPayment = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kurumService.createPayment(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})
