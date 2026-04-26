import { Router } from 'express'
import multer from 'multer'
import { validate } from '../middleware/validate'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

console.log('[DEBUG] Loading Projeler Routes...')

// 1. Şerefiye Aksiyonları
router.post('/serefiye-actions/yenile', projelerController.resetSerefiye)
router.post('/serefiye-actions/temizle', projelerController.clearSerefiye)
router.post('/serefiye-actions/olustur', projelerController.generateSerefiye)

// 2. Statik / Spesifik Rotalar (Parametresiz veya farklı yapıda olanlar)
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', projelerController.createYillikPlanKalemleriBulk)
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', projelerController.getMusaitDaireler)

// 3. Proje İş Kalemi Rotaları
router.put('/is-kalemleri/:id', validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', projelerController.deleteIsKalemi)

// 4. Şerefiye / Daire Rotaları
router.get('/:id/serefiye/export', projelerController.exportSerefiye)
router.post('/:id/serefiye/import', upload.single('file'), projelerController.importSerefiye)
router.put('/serefiye/:serefiyeId', projelerController.updateSerefiye)

// 5. Yıllık Plan Kalemi Rotaları
router.put('/yillik-plan-kalemleri/:id', validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.delete('/yillik-plan-kalemleri/:planId/:isKalemiId', projelerController.deletePlanKalemleri)

// 6. Proje Alt Kaynak Rotaları
router.get('/:id/yillik-plan/:yil', projelerController.getYillikPlan)
router.post('/:id/yillik-plan', validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)
router.post('/:id/is-kalemleri', validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/serefiye', projelerController.getSerefiye)

// 7. Proje Temel Rotaları (En alta :id koyulur ki çakışma olmasın)
router.get('/:id', projelerController.getProjeById)
router.post('/', validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', validate({ body: updateProjeSchema }), projelerController.updateProje)

export default router
