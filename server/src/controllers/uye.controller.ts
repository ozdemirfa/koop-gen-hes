import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { uyeService } from '../services/uye.service'
import { aidatService } from '../services/aidat.service'
import { catchAsync } from '../utils/catchAsync'

export const getUyes = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await uyeService.list(req.query)
  res.json({ success: true, ...result })
})

export const getUyeById = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await uyeService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createUye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await uyeService.create(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateUye = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await uyeService.update(req.params.id, req.body, req.user?.id)
  res.json({ success: true, data })
})

export const deleteUye = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  await uyeService.delete(req.params.id)
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
