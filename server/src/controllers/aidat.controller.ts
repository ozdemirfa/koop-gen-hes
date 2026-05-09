import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { aidatTanimiService, aidatService } from '../services/aidat.service'
import { catchAsync } from '../utils/catchAsync'
import logger from '../utils/logger'

// === AİDAT TANIMLARI ===

export const getAidatTanimlari = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // Verileri listelemeden önce varsa bekleyen borçlandırmaları çalıştır
  await aidatTanimiService.executeCharging().catch((err) => logger.error('Charging error', { err }))

  const data = await aidatTanimiService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.createTanim(req.body)
  res.status(201).json({ success: true, data })
})

export const createYillikPlan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.createYillikPlan(req.body)
  res.status(201).json({ success: true, data })
})

export const updateAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.updateTanim(req.params.id, req.body)
  res.json({ success: true, data })
})

export const deleteAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.deleteTanim(req.params.id)
  res.json({ success: true, data })
})

export const chargeTanim = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.chargeTanim(req.params.id)
  res.json({ success: true, data })
})

export const executeCharging = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.executeCharging(req.body.date)
  res.json({ success: true, data })
})

export const bulkChargeInterest = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const { aidat_ids } = req.body
  const data = await aidatTanimiService.bulkChargeInterest(aidat_ids)
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

export const calculateSingleLateFee = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.calculateSingleLateFee(req.params.id)
  res.json({ success: true, data })
})

export const toggleInterest = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const { active } = req.body
  const data = await aidatService.toggleInterest(req.params.id, active)
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
