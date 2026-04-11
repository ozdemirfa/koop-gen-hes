import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import { projeService } from '../services/proje.service'

const router = Router()

router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.list()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/', validate({ body: projeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/:id', validate({ body: updateProjeSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// İş kalemleri
router.post('/:id/is-kalemleri', validate({ body: projeIsKalemiSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.addIsKalemi(req.params.id, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/is-kalemleri/:id', validate({ body: projeIsKalemiSchema.partial() }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.updateIsKalemi(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.delete('/is-kalemleri/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await projeService.deleteIsKalemi(req.params.id)
    res.json({ success: true, message: 'İş kalemi silindi' })
  } catch (err) { next(err) }
})

// Yıllık plan
router.get('/:id/yillik-plan/:yil', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.getYillikPlan(req.params.id, parseInt(req.params.yil))
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/:id/yillik-plan', validate({ body: yillikPlanSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.createYillikPlan(req.params.id, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/yillik-plan-kalemleri/:id', validate({ body: yillikPlanKalemiSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.updatePlanKalemi(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// Yardımcı endpoint'ler (Üye formu vb. için)
router.get('/aktif/bloklar', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.getAktifProje()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/bloklar/:blokId/musait-daireler', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.getMusaitDaireler(req.params.blokId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// Şerefiye Yönetimi
router.get('/:id/serefiye', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.getSerefiye(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/:id/generate-serefiye', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.generateSerefiye(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.put('/serefiye/:serefiyeId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await projeService.updateSerefiye(req.params.serefiyeId, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
