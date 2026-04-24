import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { cariHesapService } from '../services/cariHesap.service'
import { catchAsync } from '../utils/catchAsync'

export const getCariHareketler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cariHesapService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const getCariHesaplar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cariHesapService.listAccounts(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createCariHareket = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cariHesapService.create(req.body)
  res.status(201).json({ success: true, data })
})

export const createPayment = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await cariHesapService.createPayment(req.body)
  res.status(201).json({ success: true, data })
})
