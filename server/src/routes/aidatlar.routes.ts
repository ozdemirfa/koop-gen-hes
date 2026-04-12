import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema } from '../schemas/aidat.schema'
import { aidatTanimiService, aidatService } from '../services/aidat.service'

const router = Router()

// === AİDAT TANIMLARI ===

// GET /api/aidat-tanimlari
router.get('/tanimlar', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatTanimiService.list()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// POST /api/aidatlar/tanimlar
router.post('/tanimlar', validate({ body: createAidatTanimiSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatTanimiService.create(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// POST /api/aidatlar/yillik-plan
router.post('/yillik-plan', validate({ body: yillikPlanSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatTanimiService.createYillikPlan(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// PUT /api/aidatlar/tanimlar/:id
router.put('/tanimlar/:id', validate({ body: updateAidatTanimiSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatTanimiService.update(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// === AİDATLAR ===

// GET /api/aidatlar
router.get('/', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const result = await aidatService.list(req.query as Record<string, any>)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
})

// GET /api/aidatlar/ozet
router.get('/ozet', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatService.getSummary()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// POST /api/aidatlar/gecikme-hesapla
router.post('/gecikme-hesapla', async (_req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatService.calculateLateFees()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// GET /api/aidatlar/:id
router.get('/:id', async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatService.getById(req.params.id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// POST /api/aidatlar/:id/odeme
router.post('/:id/odeme', validate({ body: aidatOdemeSchema }), async (req: AuthRequest<any, any, any, any>, res: Response, next: NextFunction) => {
  try {
    const data = await aidatService.recordPayment(req.params.id, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
