import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { bankaHesapService } from '../services/bankaHesap.service'
import { catchAsync } from '../utils/catchAsync'

export const getHesaplar = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.listHesaplar()
  res.json({ success: true, data })
})

export const createHesap = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.createHesap(req.body)
  res.status(201).json({ success: true, data })
})

export const updateHesap = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.updateHesap(req.params.id, req.body)
  res.json({ success: true, data })
})

export const getHareketler = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.listHareketler(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createHareket = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.createHareket(req.body)
  res.status(201).json({ success: true, data })
})

export const esleHareket = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await bankaHesapService.esle(req.params.id, req.body.eslesen_cari_hareket_id)
  res.json({ success: true, data })
})
