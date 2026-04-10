import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createFaturaSchema, updateFaturaSchema, odemePlaniSchema } from '../schemas/fatura.schema'
import { faturaService } from '../services/fatura.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await faturaService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await faturaService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: createFaturaSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await faturaService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateFaturaSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await faturaService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await faturaService.delete(req.params.id)
    res.json({ success: true, message: 'Fatura silindi' })
  } catch (err) { next(err) }
})

router.post('/:id/odeme-plani', validate({ body: odemePlaniSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await faturaService.createOdemePlani(req.params.id, req.body.taksitler)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
