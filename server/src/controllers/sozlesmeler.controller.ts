import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sozlesmeService } from '../services/sozlesme.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26):
//   proje_id req.body/query/params'tan çekilip service'e iletilir.
//   requireProjectAccess middleware zaten doğruladı; service .eq('proje_id') ile
//   cross-check yapar.
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getSozlesmeler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await sozlesmeService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getSozlesmeById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const createSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.update(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const getIsKalemleri = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.getIsKalemleri(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const addIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.addIsKalemi(req.params.id, req.body, extractProjeId(req))
  res.status(201).json({ success: true, data })
})

export const updateIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await sozlesmeService.updateIsKalemi(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const deleteIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await sozlesmeService.deleteIsKalemi(req.params.id, extractProjeId(req))
  res.json({ success: true, message: 'İş kalemi silindi' })
})

export const deleteSozlesme = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await sozlesmeService.delete(req.params.id, extractProjeId(req))
  res.json({ success: true, message: 'Sözleşme silindi' })
})
