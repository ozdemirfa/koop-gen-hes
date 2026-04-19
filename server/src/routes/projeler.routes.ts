import { Router } from 'express'
import { validate } from '../middleware/validate'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()

console.log('[DEBUG] Loading Projeler Routes...')

// 1. Şerefiye Aksiyonları (Tamamen benzersiz prefixler ile çakışmayı önle)
router.post('/serefiye-actions/yenile', projelerController.resetSerefiye)
router.post('/serefiye-actions/temizle', projelerController.clearSerefiye)
router.post('/serefiye-actions/olustur', projelerController.generateSerefiye)

// 2. Statik ve spesifik rotalar
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', projelerController.createYillikPlanKalemleriBulk)
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', projelerController.getMusaitDaireler)
router.put('/serefiye/:serefiyeId', projelerController.updateSerefiye)
router.put('/yillik-plan-kalemleri/:id', validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.put('/is-kalemleri/:id', validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', projelerController.deleteIsKalemi)

// 3. Proje ID bazlı rotalar
router.get('/:id', projelerController.getProjeById)
router.post('/', validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', validate({ body: updateProjeSchema }), projelerController.updateProje)

// 4. Proje alt kaynakları
router.post('/:id/is-kalemleri', validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/yillik-plan/:yil', projelerController.getYillikPlan)
router.post('/:id/yillik-plan', validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)

// 5. Şerefiye Sorgu
router.get('/:id/serefiye', projelerController.getSerefiye)

export default router
