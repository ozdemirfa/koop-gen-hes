import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { malzemeTeslimService } from '../services/malzemeTeslim.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const getMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.list(req.query as Record<string, any>)
  res.json({ success: true, ...data })
})

export const getMalzemeTeslimById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const createMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await malzemeTeslimService.update(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const deleteMalzemeTeslim = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await malzemeTeslimService.delete(req.params.id, extractProjeId(req))
  res.json({ success: true })
})
