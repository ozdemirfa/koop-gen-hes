import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { cariHareketSchema } from '../schemas/cariHesap.schema'
import { cariHesapService } from '../services/cariHesap.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cariHesapService.list(req.query as Record<string, any>)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: cariHareketSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cariHesapService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
