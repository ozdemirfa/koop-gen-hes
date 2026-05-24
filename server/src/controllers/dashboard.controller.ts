import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'
import { catchAsync } from '../utils/catchAsync'

export const getOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  // Tarih parametreleri opsiyonel — verilmezse RPC tüm-zaman değerlerini döner.
  // YYYY-MM-DD bekleniyor (frontend dayjs.format('YYYY-MM-DD') ile gönderir).
  const baslangicTarihi = (req.query.baslangic_tarihi as string | undefined) || undefined
  const bitisTarihi = (req.query.bitis_tarihi as string | undefined) || undefined
  const data = await raporService.dashboardOzet(projeId, baslangicTarihi, bitisTarihi)
  res.json({ success: true, data })
})

export const getAidatDurumu = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const projeId = req.query.projeId as string
  const data = await raporService.aidatDurumu(projeId)
  res.json({ success: true, data })
})
