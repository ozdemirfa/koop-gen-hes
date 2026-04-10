import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createFirmaSchema, updateFirmaSchema } from '../schemas/firma.schema'
import { firmaService } from '../services/firma.service'

const router = Router()

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await firmaService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await firmaService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: createFirmaSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await firmaService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateFirmaSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await firmaService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/:id/cari-ekstre', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await firmaService.getCariEkstre(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
