import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createHakedisSchema, updateHakedisSchema, hakedisKalemlerBatchSchema } from '../schemas/hakedis.schema'
import { hakedisService } from '../services/hakedis.service'

const router = Router()

router.get('/', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const result = await hakedisService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await hakedisService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: createHakedisSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await hakedisService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateHakedisSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await hakedisService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id/onayla', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await hakedisService.approve(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/:id/kalemler', validate({ body: hakedisKalemlerBatchSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await hakedisService.updateKalemler(req.params.id, req.body.kalemler)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
