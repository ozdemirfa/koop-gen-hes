import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { kategoriSchema, gelirGiderSchema, updateGelirGiderSchema } from '../schemas/gelirGider.schema'
import { kategoriService, gelirGiderService } from '../services/gelirGider.service'

const router = Router()

// === KATEGORİLER ===

router.get('/kategoriler', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await kategoriService.list()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/kategoriler', validate({ body: kategoriSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await kategoriService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// === GELİR/GİDER ===

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await gelirGiderService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await gelirGiderService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: gelirGiderSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await gelirGiderService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateGelirGiderSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await gelirGiderService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await gelirGiderService.delete(req.params.id)
    res.json({ success: true, message: 'Kayıt silindi' })
  } catch (err) { next(err) }
})

export default router
