import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema } from '../schemas/aidat.schema'
import * as aidatController from '../controllers/aidat.controller'

const router = Router()

// === AİDAT TANIMLARI ===

// POST /api/aidatlar/tanimlar/:id/borclandir
router.post('/tanimlar/:id/borclandir', requireProjectAccess('staff'), aidatController.chargeTanim)

// GET /api/aidatlar/tanimlar
router.get('/tanimlar', requireProjectAccess('viewer'), aidatController.getAidatTanimlari)

// POST /api/aidatlar/tanimlar
router.post('/tanimlar', requireProjectAccess('staff'), validate({ body: createAidatTanimiSchema }), aidatController.createAidatTanimi)

// POST /api/aidatlar/yillik-plan
router.post('/yillik-plan', requireProjectAccess('staff'), validate({ body: yillikPlanSchema }), aidatController.createYillikPlan)

// PUT /api/aidatlar/tanimlar/:id
router.put('/tanimlar/:id', requireProjectAccess('staff'), validate({ body: updateAidatTanimiSchema }), aidatController.updateAidatTanimi)

// DELETE /api/aidatlar/tanimlar/:id
router.delete('/tanimlar/:id', requireProjectAccess('staff'), aidatController.deleteAidatTanimi)

// POST /api/aidatlar/execute-charging — toplu borçlandırma; global admin only
router.post('/execute-charging', requireRole('admin'), requireProjectAccess('viewer'), aidatController.executeCharging)

// POST /api/aidatlar/bulk-charge-interest — toplu faiz tahakkuk; global admin only
router.post('/bulk-charge-interest', requireRole('admin'), requireProjectAccess('viewer'), aidatController.bulkChargeInterest)

// === AİDATLAR ===

// GET /api/aidatlar/ozet (Must be before /:id)
router.get('/ozet', requireProjectAccess('viewer'), aidatController.getAidatOzet)

// POST /api/aidatlar/gecikme-hesapla (Tüm proje için)
router.post('/gecikme-hesapla', requireProjectAccess('staff'), aidatController.calculateLateFees)

// GET /api/aidatlar
router.get('/', requireProjectAccess('viewer'), aidatController.getAidatlar)

// GET /api/aidatlar/:id (proje_id query'den gelir; aksi halde middleware 400 döner)
router.get('/:id', requireProjectAccess('viewer'), aidatController.getAidatById)

// POST /api/aidatlar/:id/odeme
router.post('/:id/odeme', requireProjectAccess('staff'), validate({ body: aidatOdemeSchema }), aidatController.recordPayment)

// POST /api/aidatlar/:id/gecikme-hesapla (Tek bir aidat için)
router.post('/:id/gecikme-hesapla', requireProjectAccess('staff'), aidatController.calculateSingleLateFee)

// POST /api/aidatlar/:id/toggle-faiz (Faiz Ekle/Sil) — finansal manipülasyon; global admin only
router.post('/:id/toggle-faiz', requireRole('admin'), requireProjectAccess('viewer'), aidatController.toggleInterest)

export default router
