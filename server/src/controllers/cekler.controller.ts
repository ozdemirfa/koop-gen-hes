import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { cekService } from '../services/cek.service'
import { catchAsync } from '../utils/catchAsync'

export const getCekler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const getCekById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.getById(req.params.id)
  res.json({ success: true, data })
})

export const createCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const updateCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.update(req.params.id, req.body)
  res.json({ success: true, data })
})

export const updateCekDurum = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.updateDurum(req.params.id, req.body.durum)
  res.json({ success: true, data })
})

export const payCek = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cekService.payCheck(req.params.id, req.body.banka_hesap_id)
  res.json({ success: true, data })
})
