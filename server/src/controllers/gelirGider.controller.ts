import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { kategoriService, gelirGiderService } from '../services/gelirGider.service'
import { catchAsync } from '../utils/catchAsync'

// === KATEGORİLER ===

export const getKategoriler = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kategoriService.list()
  res.json({ success: true, data })
})

export const createKategori = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kategoriService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateKategori = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await kategoriService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteKategori = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await kategoriService.delete(req.params.id)
  res.json({ success: true, message: 'Kategori silindi' })
})

// === GELİR/GİDER ===

export const getGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await gelirGiderService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getGelirGiderById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await gelirGiderService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await gelirGiderService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await gelirGiderService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await gelirGiderService.delete(req.params.id)
  res.json({ success: true, message: 'Kayıt silindi' })
})
