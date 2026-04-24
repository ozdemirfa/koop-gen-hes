import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema } from '../schemas/aidat.schema'
import * as aidatController from '../controllers/aidat.controller'

const router = Router()

// === AİDAT TANIMLARI ===

// POST /api/aidatlar/tanimlar/:id/borclandir
router.post('/tanimlar/:id/borclandir', aidatController.chargeTanim)

// GET /api/aidatlar/tanimlar
router.get('/tanimlar', aidatController.getAidatTanimlari)

// POST /api/aidatlar/tanimlar
router.post('/tanimlar', validate({ body: createAidatTanimiSchema }), aidatController.createAidatTanimi)

// POST /api/aidatlar/yillik-plan
router.post('/yillik-plan', validate({ body: yillikPlanSchema }), aidatController.createYillikPlan)

// PUT /api/aidatlar/tanimlar/:id
router.put('/tanimlar/:id', validate({ body: updateAidatTanimiSchema }), aidatController.updateAidatTanimi)

// DELETE /api/aidatlar/tanimlar/:id
router.delete('/tanimlar/:id', aidatController.deleteAidatTanimi)

// POST /api/aidatlar/execute-charging
router.post('/execute-charging', aidatController.executeCharging)

// === AİDATLAR ===

// GET /api/aidatlar/ozet (Must be before /:id)
router.get('/ozet', aidatController.getAidatOzet)

// POST /api/aidatlar/gecikme-hesapla (Tüm proje için)
router.post('/gecikme-hesapla', aidatController.calculateLateFees)

// GET /api/aidatlar
router.get('/', aidatController.getAidatlar)

// GET /api/aidatlar/:id
router.get('/:id', aidatController.getAidatById)

// POST /api/aidatlar/:id/odeme
router.post('/:id/odeme', validate({ body: aidatOdemeSchema }), aidatController.recordPayment)

// POST /api/aidatlar/:id/gecikme-hesapla (Tek bir aidat için)
router.post('/:id/gecikme-hesapla', aidatController.calculateSingleLateFee)

export default router
