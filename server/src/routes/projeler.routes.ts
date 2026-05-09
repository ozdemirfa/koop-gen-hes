import { Router } from 'express'
import multer from 'multer'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// 1. Şerefiye Aksiyonları
router.post('/serefiye-actions/yenile', requireRole('admin'), projelerController.resetSerefiye)
router.post('/serefiye-actions/temizle', requireRole('admin'), projelerController.clearSerefiye)
router.post('/serefiye-actions/olustur', requireRole('admin'), projelerController.generateSerefiye)

// 2. Statik / Spesifik Rotalar (Parametresiz veya farklı yapıda olanlar)
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', requireRole('admin'), projelerController.createYillikPlanKalemleriBulk)
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', projelerController.getMusaitDaireler)

// 3. Proje İş Kalemi Rotaları
router.put('/is-kalemleri/:id', requireRole('admin'), validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireRole('admin'), projelerController.deleteIsKalemi)

// 4. Şerefiye / Daire Rotaları
router.get('/:id/serefiye/export', projelerController.exportSerefiye)
router.post('/:id/serefiye/import', requireRole('admin'), upload.single('file'), projelerController.importSerefiye)
router.put('/serefiye/:serefiyeId', requireRole('admin'), projelerController.updateSerefiye)

// 5. Yıllık Plan Kalemi Rotaları
router.put('/yillik-plan-kalemleri/:id', requireRole('admin'), validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.delete('/yillik-plan-kalemleri/:planId/:isKalemiId', requireRole('admin'), projelerController.deletePlanKalemleri)

// 6. Proje Alt Kaynak Rotaları
router.get('/:id/yillik-plan/:yil', projelerController.getYillikPlan)
router.post('/:id/yillik-plan', requireRole('admin'), validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)
router.post('/:id/is-kalemleri', requireRole('admin'), validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/serefiye', projelerController.getSerefiye)

// 7. Proje Temel Rotaları (En alta :id koyulur ki çakışma olmasın)
router.get('/:id', projelerController.getProjeById)
router.post('/', requireRole('admin'), validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', requireRole('admin'), validate({ body: updateProjeSchema }), projelerController.updateProje)

export default router
