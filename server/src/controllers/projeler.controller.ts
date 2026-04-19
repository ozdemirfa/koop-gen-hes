import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { projeService } from '../services/proje.service'
import { catchAsync } from '../utils/catchAsync'
import { supabaseAdmin } from '../config/supabase'

export const getProjeler = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.list()
  res.json({ success: true, data })
})

export const getProjeById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createProje = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateProje = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const createIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.createIsKalemi(req.params.id, req.body)
  res.status(201).json({ success: true, data })
})

export const updateIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.updateIsKalemi(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteIsKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  await projeService.deleteIsKalemi(req.params.id)
  res.json({ success: true, message: 'İş kalemi silindi' })
})

export const getYillikPlan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.getYillikPlan(req.params.id, parseInt(req.params.yil))
  res.json({ success: true, data })
})

export const createYillikPlan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.createYillikPlan(req.params.id, req.body)
  res.status(201).json({ success: true, data })
})

export const updatePlanKalemi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.updatePlanKalemi(req.params.id, req.body)
  res.json({ success: true, data })
})

export const getAktifBloklar = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.getAktifProje()
  res.json({ success: true, data })
})

export const getMusaitDaireler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.getMusaitDaireler(req.params.blokId)
  res.json({ success: true, data })
})

export const getSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.getSerefiye(req.params.id)
  res.json({ success: true, data })
})

export const generateSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.generateSerefiye(req.params.id)
  res.json({ success: true, data })
})

export const syncSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.syncSerefiye(req.params.id)
  res.json({ success: true, data })
})

export const resetSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  console.log(`[DEBUG] resetSerefiye called for ID: ${req.params.id}`)
  const data = await projeService.resetSerefiye(req.params.id)
  res.json({ success: true, data })
})

export const clearSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.clearSerefiye(req.params.id)
  res.json({ success: true, data })
})

export const updateSerefiye = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await projeService.updateSerefiye(req.params.serefiyeId, req.body)
  res.json({ success: true, data })
})

export const createYillikPlanKalemleriBulk = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const { kalemler } = req.body
  const { data, error } = await supabaseAdmin.from('yillik_plan_kalemleri').insert(kalemler).select()
  if (error) throw error
  res.json({ success: true, data })
})
