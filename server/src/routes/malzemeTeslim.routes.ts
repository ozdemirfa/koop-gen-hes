import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { malzemeTeslimSchema, updateMalzemeTeslimSchema } from '../schemas/malzemeTeslim.schema'
import { malzemeTeslimService } from '../services/malzemeTeslim.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await malzemeTeslimService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await malzemeTeslimService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: malzemeTeslimSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await malzemeTeslimService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateMalzemeTeslimSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await malzemeTeslimService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await malzemeTeslimService.delete(req.params.id)
    res.json({ success: true, message: 'Teslim kaydı silindi' })
  } catch (err) { next(err) }
})

export default router
