import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'
import { catchAsync } from '../utils/catchAsync'

export const getOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.dashboardOzet(projeId)
  res.json({ success: true, data })
})

export const getAidatDurumu = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.aidatDurumu(projeId)
  res.json({ success: true, data })
})
