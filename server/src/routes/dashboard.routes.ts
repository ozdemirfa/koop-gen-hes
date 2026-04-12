import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { raporService } from '../services/rapor.service'

const router = Router()

router.get('/ozet', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await raporService.dashboardOzet()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/aylik-gelir-gider', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const yil = req.query.yil ? parseInt(req.query.yil as string) : undefined
    const data = await raporService.aylikGelirGider(yil)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/aidat-durumu', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await raporService.aidatDurumu()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
