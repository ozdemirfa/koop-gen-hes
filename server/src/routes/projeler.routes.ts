import { Router } from 'express'
import { validate } from '../middleware/validate'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()

router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', projelerController.createYillikPlanKalemleriBulk)
router.get('/:id', projelerController.getProjeById)
router.post('/', validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', validate({ body: updateProjeSchema }), projelerController.updateProje)

// İş kalemleri
router.post('/:id/is-kalemleri', validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.put('/is-kalemleri/:id', validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', projelerController.deleteIsKalemi)

// Yıllık plan
router.get('/:id/yillik-plan/:yil', projelerController.getYillikPlan)
router.post('/:id/yillik-plan', validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)
router.put('/yillik-plan-kalemleri/:id', validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)

// Yardımcı endpoint'ler (Üye formu vb. için)
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', projelerController.getMusaitDaireler)

// Şerefiye Yönetimi
router.get('/:id/serefiye', projelerController.getSerefiye)
router.post('/:id/generate-serefiye', projelerController.generateSerefiye)
router.post('/:id/sync-serefiye', projelerController.syncSerefiye)
router.post('/:id/reset-serefiye', projelerController.resetSerefiye)
router.put('/serefiye/:serefiyeId', projelerController.updateSerefiye)

export default router
