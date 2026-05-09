import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema } from '../schemas/aidat.schema'
import * as aidatController from '../controllers/aidat.controller'

const router = Router()

// === AİDAT TANIMLARI ===

// POST /api/aidatlar/tanimlar/:id/borclandir
router.post('/tanimlar/:id/borclandir', requireRole('staff'), aidatController.chargeTanim)

// GET /api/aidatlar/tanimlar
router.get('/tanimlar', aidatController.getAidatTanimlari)

// POST /api/aidatlar/tanimlar
router.post('/tanimlar', requireRole('admin'), validate({ body: createAidatTanimiSchema }), aidatController.createAidatTanimi)

// POST /api/aidatlar/yillik-plan
router.post('/yillik-plan', requireRole('admin'), validate({ body: yillikPlanSchema }), aidatController.createYillikPlan)

// PUT /api/aidatlar/tanimlar/:id
router.put('/tanimlar/:id', requireRole('admin'), validate({ body: updateAidatTanimiSchema }), aidatController.updateAidatTanimi)

// DELETE /api/aidatlar/tanimlar/:id
router.delete('/tanimlar/:id', requireRole('admin'), aidatController.deleteAidatTanimi)

// POST /api/aidatlar/execute-charging
router.post('/execute-charging', requireRole('admin'), aidatController.executeCharging)

// POST /api/aidatlar/bulk-charge-interest
router.post('/bulk-charge-interest', requireRole('admin'), aidatController.bulkChargeInterest)

// === AİDATLAR ===

// GET /api/aidatlar/ozet (Must be before /:id)
router.get('/ozet', aidatController.getAidatOzet)

// POST /api/aidatlar/gecikme-hesapla (Tüm proje için)
router.post('/gecikme-hesapla', requireRole('staff'), aidatController.calculateLateFees)

// GET /api/aidatlar
router.get('/', aidatController.getAidatlar)

// GET /api/aidatlar/:id
router.get('/:id', aidatController.getAidatById)

// POST /api/aidatlar/:id/odeme
router.post('/:id/odeme', requireRole('staff'), validate({ body: aidatOdemeSchema }), aidatController.recordPayment)

// POST /api/aidatlar/:id/gecikme-hesapla (Tek bir aidat için)
router.post('/:id/gecikme-hesapla', requireRole('staff'), aidatController.calculateSingleLateFee)

// POST /api/aidatlar/:id/toggle-faiz (Faiz Ekle/Sil)
router.post('/:id/toggle-faiz', requireRole('admin'), aidatController.toggleInterest)

export default router
