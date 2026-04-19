import { Router } from 'express'
import { validate } from '../middleware/validate'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()

// 1. Statik ve spesifik rotalar (Shadowing'i önlemek için en üstte)
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', projelerController.createYillikPlanKalemleriBulk)
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', projelerController.getMusaitDaireler)
router.put('/serefiye/:serefiyeId', projelerController.updateSerefiye)
router.put('/yillik-plan-kalemleri/:id', validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.put('/is-kalemleri/:id', validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', projelerController.deleteIsKalemi)

// 2. Proje ID bazlı rotalar
router.get('/:id', projelerController.getProjeById)
router.post('/', validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', validate({ body: updateProjeSchema }), projelerController.updateProje)

// 3. Proje alt kaynakları (Spesifik sub-pathler)
router.post('/:id/is-kalemleri', validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/yillik-plan/:yil', projelerController.getYillikPlan)
router.post('/:id/yillik-plan', validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)

// 4. Şerefiye Yönetimi
router.get('/:id/serefiye', projelerController.getSerefiye)
router.post('/:id/generate-serefiye', projelerController.generateSerefiye)
router.post('/:id/sync-serefiye', projelerController.syncSerefiye)
router.post('/:id/refresh-serefiye', projelerController.resetSerefiye)

export default router
