import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { aidatTanimiService, aidatService } from '../services/aidat.service'
import { catchAsync } from '../utils/catchAsync'

// === AİDAT TANIMLARI ===

export const getAidatTanimlari = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const createYillikPlan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.createYillikPlan(req.body)
  res.status(201).json({ success: true, data })
})

export const updateAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

// === AİDATLAR ===

export const getAidatlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await aidatService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getAidatOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.getSummary(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const calculateLateFees = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.calculateLateFees(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const getAidatById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.getById(req.params.id)
  res.json({ success: true, data })
})

export const recordPayment = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.recordPayment(req.params.id, req.body)
  res.json({ success: true, data })
})
