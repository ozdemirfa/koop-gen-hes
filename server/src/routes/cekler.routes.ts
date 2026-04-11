import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { cekSchema, updateCekSchema, cekDurumSchema } from '../schemas/cek.schema'
import { cekService } from '../services/cek.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cekService.list(req.query as Record<string, any>)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cekService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: cekSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cekService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateCekSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cekService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.patch('/:id/durum', validate({ body: cekDurumSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cekService.updateDurum(req.params.id, req.body.durum)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
