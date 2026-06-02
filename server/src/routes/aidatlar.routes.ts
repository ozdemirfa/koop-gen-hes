import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createAidatTanimiSchema, updateAidatTanimiSchema, aidatOdemeSchema, yillikPlanSchema, updateAidatRowSchema } from '../schemas/aidat.schema'
import * as aidatController from '../controllers/aidat.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET                          → user
//   POST/PUT (form girişi)       → user
//   DELETE                       → manager
//   borclandir (manuel charge)   → manager (parametre/finans etki)
//   execute-charging (toplu)     → manager
//   bulk-charge-interest         → manager
//   toggle-faiz                  → manager (finansal manipülasyon)

// === AİDAT TANIMLARI ===

// POST /api/aidatlar/tanimlar/:id/borclandir — manuel borçlandırma → manager
router.post('/tanimlar/:id/borclandir', requireProjectAccess('manager'), aidatController.chargeTanim)

// POST /api/aidatlar/tanimlar/:id/borclandirma-geri-al — borçlandırmayı geri al → manager.
// Tanımı 'plan'a döndürür (ödeme eşleştirmesi yoksa). Sonra düzenle/sil mümkün olur.
router.post('/tanimlar/:id/borclandirma-geri-al', requireProjectAccess('manager'), aidatController.unchargeTanim)

router.get('/tanimlar', requireProjectAccess('user'), aidatController.getAidatTanimlari)
router.post('/tanimlar', requireProjectAccess('manager'), validate({ body: createAidatTanimiSchema }), aidatController.createAidatTanimi)
router.post('/yillik-plan', requireProjectAccess('manager'), validate({ body: yillikPlanSchema }), aidatController.createYillikPlan)
router.put('/tanimlar/:id', requireProjectAccess('manager'), validate({ body: updateAidatTanimiSchema }), aidatController.updateAidatTanimi)
router.delete('/tanimlar/:id', requireProjectAccess('manager'), aidatController.deleteAidatTanimi)

// Toplu borçlandırma + toplu faiz — manager+
router.post('/execute-charging', requireProjectAccess('manager'), aidatController.executeCharging)
router.post('/bulk-charge-interest', requireProjectAccess('manager'), aidatController.bulkChargeInterest)

// === AİDATLAR ===

router.get('/ozet', requireProjectAccess('user'), aidatController.getAidatOzet)
router.post('/gecikme-hesapla', requireProjectAccess('manager'), aidatController.calculateLateFees)

router.get('/', requireProjectAccess('user'), aidatController.getAidatlar)
router.get('/:id', requireProjectAccess('user'), aidatController.getAidatById)

// DELETE /api/aidatlar/:id — tekil aidat satırı sil → manager.
// Ödeme eşleştirmesi yoksa siler; varsa 409 + yönlendirme mesajı.
router.delete('/:id', requireProjectAccess('manager'), aidatController.deleteAidat)

// PUT /api/aidatlar/:id — aidat satırı düzenle (tutar + son ödeme tarihi) → manager.
// proje_id query param'dan okunur. Ödeme yapılmışsa tutar değişimi 409.
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateAidatRowSchema }), aidatController.updateAidatRow)

router.post('/:id/odeme', requireProjectAccess('manager'), validate({ body: aidatOdemeSchema }), aidatController.recordPayment)
router.post('/:id/gecikme-hesapla', requireProjectAccess('manager'), aidatController.calculateSingleLateFee)

// Toggle faiz — finansal manipülasyon; manager+
router.post('/:id/toggle-faiz', requireProjectAccess('manager'), aidatController.toggleInterest)

export default router
