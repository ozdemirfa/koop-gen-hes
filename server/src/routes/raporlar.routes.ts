import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'

const router = Router()

router.get('/aylik-rapor', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const yil = parseInt(req.query.yil as string) || new Date().getFullYear()
    const ay = parseInt(req.query.ay as string) || new Date().getMonth() + 1
    const data = await raporService.aylikRapor(yil, ay)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/yillik-rapor', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const yil = parseInt(req.query.yil as string) || new Date().getFullYear()
    const data = await raporService.yillikRapor(yil)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/uye-borc-listesi', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await raporService.uyeBorcListesi()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/hakedis-ozet', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await raporService.hakedisOzet()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
