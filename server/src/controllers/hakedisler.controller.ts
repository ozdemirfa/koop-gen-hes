import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { hakedisService } from '../services/hakedis.service'
import { pdfGenerator } from '../utils/pdfGenerator'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getHakedisler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await hakedisService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getHakedisById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const downloadHakedisPdf = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.getPDFData(req.params.id, extractProjeId(req))
  const docDefinition = pdfGenerator.generateHakedisPDF(data)
  const pdfDoc = pdfGenerator.createPdfStream(docDefinition)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=hakedis_${req.params.id}.pdf`)

  pdfDoc.pipe(res)
  pdfDoc.end()
})

export const createHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.update(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const approveHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.approve(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const unapproveHakedis = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.unapprove(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const updateKalemler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.updateKalemler(req.params.id, req.body.kalemler, extractProjeId(req))
  res.json({ success: true, data })
})

// Alternatif A: açık irsaliyelerin hakedişe toplu eklenmesi
export const attachIrsaliyeler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.attachIrsaliyeler(req.params.id, req.body.irsaliye_ids, extractProjeId(req))
  res.json({ success: true, data })
})

export const detachIrsaliye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await hakedisService.detachIrsaliye(req.params.id, req.params.irsaliyeId, extractProjeId(req))
  res.json({ success: true, data })
})
