import { Router } from 'express'
import multer from 'multer'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { projeSchema, updateProjeSchema, projeIsKalemiSchema, yillikPlanSchema, yillikPlanKalemiSchema } from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// 1. Şerefiye Aksiyonları — yapısal kurulum; global admin only
router.post('/serefiye-actions/yenile', requireRole('admin'), requireProjectAccess('viewer'), projelerController.resetSerefiye)
router.post('/serefiye-actions/temizle', requireRole('admin'), requireProjectAccess('viewer'), projelerController.clearSerefiye)
router.post('/serefiye-actions/olustur', requireRole('admin'), requireProjectAccess('viewer'), projelerController.generateSerefiye)

// 2. Statik / Spesifik Rotalar
// GET /projeler — controller kullanıcı üyeliğine göre filtreler (Faz 1.4)
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', requireProjectAccess('staff'), projelerController.createYillikPlanKalemleriBulk)
// Global "aktif proje" sorgusu — proje_id gerektirmez
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', requireProjectAccess('viewer'), projelerController.getMusaitDaireler)

// 3. Proje İş Kalemi Rotaları (proje_id query'den gelir)
router.put('/is-kalemleri/:id', requireProjectAccess('staff'), validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireProjectAccess('staff'), projelerController.deleteIsKalemi)

// 4. Şerefiye / Daire Rotaları
router.get('/:id/serefiye/export', requireProjectAccess('viewer'), projelerController.exportSerefiye)
// İçe aktarma yapısal dataset replace; admin only
router.post('/:id/serefiye/import', requireRole('admin'), requireProjectAccess('viewer'), upload.single('file'), projelerController.importSerefiye)
router.put('/serefiye/:serefiyeId', requireProjectAccess('staff'), projelerController.updateSerefiye)

// 5. Yıllık Plan Kalemi Rotaları
router.put('/yillik-plan-kalemleri/:id', requireProjectAccess('staff'), validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.delete('/yillik-plan-kalemleri/:planId/:isKalemiId', requireProjectAccess('staff'), projelerController.deletePlanKalemleri)

// 6. Proje Alt Kaynak Rotaları (:id = proje_id)
router.get('/:id/yillik-plan/:yil', requireProjectAccess('viewer'), projelerController.getYillikPlan)
router.post('/:id/yillik-plan', requireProjectAccess('staff'), validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)
router.post('/:id/is-kalemleri', requireProjectAccess('staff'), validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/serefiye', requireProjectAccess('viewer'), projelerController.getSerefiye)

// 7. Proje Temel Rotaları
router.get('/:id', requireProjectAccess('viewer'), projelerController.getProjeById)
// Yeni proje oluşturma — sistem yapısı; global admin only
router.post('/', requireRole('admin'), validate({ body: projeSchema }), projelerController.createProje)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateProjeSchema }), projelerController.updateProje)

export default router
