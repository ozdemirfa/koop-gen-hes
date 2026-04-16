import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'
import { catchAsync } from '../utils/catchAsync'

export const getOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  console.log('[DASHBOARD] Fetching ozet data for project:', projeId)
  const data = await raporService.dashboardOzet(projeId)
  console.log('[DASHBOARD] Ozet data fetched successfully:', !!data)
  res.json({ success: true, data })
})

export const getAylikGelirGider = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const yil = req.query.yil ? parseInt(req.query.yil as string) : undefined
  const data = await raporService.aylikGelirGider(projeId, yil)
  res.json({ success: true, data })
})

export const getAidatDurumu = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.aidatDurumu(projeId)
  res.json({ success: true, data })
})
