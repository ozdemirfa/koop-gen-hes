import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema } from '../schemas/aidat.schema'
import * as aidatController from '../controllers/aidat.controller'

const router = Router()

// === AİDAT TANIMLARI ===

// GET /api/aidatlar/tanimlar
router.get('/tanimlar', aidatController.getAidatTanimlari)

// POST /api/aidatlar/tanimlar
router.post('/tanimlar', validate({ body: createAidatTanimiSchema }), aidatController.createAidatTanimi)

// POST /api/aidatlar/yillik-plan
router.post('/yillik-plan', validate({ body: yillikPlanSchema }), aidatController.createYillikPlan)

// PUT /api/aidatlar/tanimlar/:id
router.put('/tanimlar/:id', validate({ body: updateAidatTanimiSchema }), aidatController.updateAidatTanimi)

// === AİDATLAR ===

// GET /api/aidatlar
router.get('/', aidatController.getAidatlar)

// GET /api/aidatlar/ozet
router.get('/ozet', aidatController.getAidatOzet)

// POST /api/aidatlar/gecikme-hesapla
router.post('/gecikme-hesapla', aidatController.calculateLateFees)

// GET /api/aidatlar/:id
router.get('/:id', aidatController.getAidatById)

// POST /api/aidatlar/:id/odeme
router.post('/:id/odeme', validate({ body: aidatOdemeSchema }), aidatController.recordPayment)

export default router
