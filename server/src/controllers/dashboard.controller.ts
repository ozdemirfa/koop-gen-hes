import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'
import { catchAsync } from '../utils/catchAsync'

export const getOzet = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  console.log('[DASHBOARD] Fetching ozet data...')
  const data = await raporService.dashboardOzet()
  console.log('[DASHBOARD] Ozet data fetched successfully:', !!data)
  res.json({ success: true, data })
})

export const getAylikGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const yil = req.query.yil ? parseInt(req.query.yil as string) : undefined
  const data = await raporService.aylikGelirGider(yil)
  res.json({ success: true, data })
})

export const getAidatDurumu = catchAsync(async (_req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await raporService.aidatDurumu()
  res.json({ success: true, data })
})
