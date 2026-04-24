import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { firmaService } from '../services/firma.service'
import { catchAsync } from '../utils/catchAsync'

export const getFirmalar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await firmaService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getFirmaById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.getById(req.params.id)
  res.json({ success: true, data })
})

export const getStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const projeId = req.query.proje_id as string
  if (!projeId) {
    return res.status(400).json({ success: false, error: 'proje_id gereklidir' })
  }
  const data = await firmaService.getStats(projeId)
  res.json({ success: true, data })
})

export const getFirmaStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const projeId = req.query.proje_id as string
  if (!projeId) {
    return res.status(400).json({ success: false, error: 'proje_id gereklidir' })
  }
  const data = await firmaService.getIndividualStats(id, projeId)
  res.json({ success: true, data })
})

export const createFirma = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateFirma = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const getCariEkstre = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await firmaService.getCariEkstre(req.params.id)
  res.json({ success: true, data })
})
