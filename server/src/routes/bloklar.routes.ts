import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { blokSchema } from '../schemas/uye.schema'
import { blokService } from '../services/uye.service'

const router = Router()

router.get('/', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await blokService.list()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: blokSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await blokService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: blokSchema.partial() }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await blokService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    await blokService.delete(req.params.id)
    res.json({ success: true, message: 'Blok silindi' })
  } catch (err) { next(err) }
})

export default router
