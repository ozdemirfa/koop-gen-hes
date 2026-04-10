import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createSozlesmeSchema, updateSozlesmeSchema, isKalemiSchema } from '../schemas/sozlesme.schema'
import { sozlesmeService } from '../services/sozlesme.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await sozlesmeService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: createSozlesmeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateSozlesmeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// İş kalemleri
router.get('/:id/is-kalemleri', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.getIsKalemleri(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/:id/is-kalemleri', validate({ body: isKalemiSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.addIsKalemi(req.params.id, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/is-kalemleri/:id', validate({ body: isKalemiSchema.partial() }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await sozlesmeService.updateIsKalemi(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/is-kalemleri/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await sozlesmeService.deleteIsKalemi(req.params.id)
    res.json({ success: true, message: 'İş kalemi silindi' })
  } catch (err) { next(err) }
})

export default router
