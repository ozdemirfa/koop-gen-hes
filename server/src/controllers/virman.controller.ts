import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { virmanService } from '../services/virman.service'
import { catchAsync } from '../utils/catchAsync'

export const listVirmanlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await virmanService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await virmanService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const deleteVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // proje_id query string'inden gelir; middleware aynı id'yi requireProjectAccess
  // ile doğrulamış olur → service tekrar eşleştirir (defense in depth).
  const projeId = String((req.query as any).proje_id || '')
  const data = await virmanService.remove(req.params.id, projeId)
  res.json({ success: true, data })
})