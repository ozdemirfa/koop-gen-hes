import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createUyeSchema, updateUyeSchema } from '../schemas/uye.schema'
import { uyeService } from '../services/uye.service'

const router = Router()

// GET /api/uyeler
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await uyeService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

// GET /api/uyeler/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await uyeService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// POST /api/uyeler
router.post('/', validate({ body: createUyeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await uyeService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// PUT /api/uyeler/:id
router.put('/:id', validate({ body: updateUyeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await uyeService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// DELETE /api/uyeler/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await uyeService.delete(req.params.id)
    res.json({ success: true, message: 'Üye pasif yapıldı' })
  } catch (err) { next(err) }
})

// GET /api/uyeler/:id/aidatlar
router.get('/:id/aidatlar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await uyeService.getAidatlar(req.params.id, req.query as Record<string, any>)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
