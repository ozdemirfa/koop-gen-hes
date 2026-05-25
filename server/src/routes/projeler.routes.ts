import { Router } from 'express'
import multer from 'multer'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { requireYetkili } from '../middleware/requireRole'
import {
  projeSchema,
  updateProjeSchema,
  projeIsKalemiSchema,
  yillikPlanSchema,
  yillikPlanKalemiSchema,
  yillikPlanKalemleriBulkSchema,
  arsivleProjeSchema,
  kaliciSilProjeSchema,
  offlineModeSchema,
} from '../schemas/proje.schema'
import * as projelerController from '../controllers/projeler.controller'

const router = Router()
// Sprint qa-review-bugfix-faz3 (2026-05-25, P0): memoryStorage'a fileSize +
// files cap + CSV-only fileFilter. Önceden no limit → 6+ MB body memory'yi
// patlatabilirdi; mimetype kontrolü olmadığı için arbitrary binary upload
// edilebilirdi.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      /\.csv$/i.test(file.originalname)
    if (!isCsv) {
      cb(new Error('CSV_ONLY'))
      return
    }
    cb(null, true)
  },
})

// Sprint role-system-modernization (PR-B):
//   GET (liste/detay/alt kaynaklar)  → user
//   POST/PUT (form girişi)           → user
//   serefiye actions (yapısal reset/clear/generate/import) → manager
//   POST /projeler (yeni proje)      → authenticated (auto-owner trigger devreye girer)
//   PUT  /projeler/:id               → manager (proje meta düzenleme)
//   DELETE iş-kalemi / plan-kalemi   → manager

// 1. Şerefiye Aksiyonları — yapısal dataset replace; manager+
router.post('/serefiye-actions/yenile', requireProjectAccess('manager'), projelerController.resetSerefiye)
router.post('/serefiye-actions/temizle', requireProjectAccess('manager'), projelerController.clearSerefiye)
router.post('/serefiye-actions/olustur', requireProjectAccess('manager'), projelerController.generateSerefiye)

// 2. Statik / Spesifik Rotalar
// GET /projeler — controller kullanıcı üyeliğine göre filtreler (Faz 1.4)
router.get('/', projelerController.getProjeler)
router.post('/yillik-plan-kalemleri/bulk', requireProjectAccess('user'), validate({ body: yillikPlanKalemleriBulkSchema }), projelerController.createYillikPlanKalemleriBulk)
// Global "aktif proje" sorgusu — proje_id gerektirmez
router.get('/aktif/bloklar', projelerController.getAktifBloklar)
router.get('/bloklar/:blokId/musait-daireler', requireProjectAccess('user'), projelerController.getMusaitDaireler)

// 3. Proje İş Kalemi Rotaları (proje_id query'den gelir)
router.put('/is-kalemleri/:id', requireProjectAccess('user'), validate({ body: projeIsKalemiSchema.partial() }), projelerController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireProjectAccess('manager'), projelerController.deleteIsKalemi)

// 4. Şerefiye / Daire Rotaları
router.get('/:id/serefiye/export', requireProjectAccess('user'), projelerController.exportSerefiye)
// İçe aktarma yapısal dataset replace; manager+
router.post('/:id/serefiye/import', requireProjectAccess('manager'), upload.single('file'), projelerController.importSerefiye)
router.put('/serefiye/:serefiyeId', requireProjectAccess('user'), projelerController.updateSerefiye)

// 5. Yıllık Plan Kalemi Rotaları
router.put('/yillik-plan-kalemleri/:id', requireProjectAccess('user'), validate({ body: yillikPlanKalemiSchema }), projelerController.updatePlanKalemi)
router.delete('/yillik-plan-kalemleri/:planId/:isKalemiId', requireProjectAccess('manager'), projelerController.deletePlanKalemleri)

// 6. Proje Alt Kaynak Rotaları (:id = proje_id)
router.get('/:id/yillik-plan/:yil', requireProjectAccess('user'), projelerController.getYillikPlan)
router.post('/:id/yillik-plan', requireProjectAccess('user'), validate({ body: yillikPlanSchema }), projelerController.createYillikPlan)
router.post('/:id/is-kalemleri', requireProjectAccess('user'), validate({ body: projeIsKalemiSchema }), projelerController.createIsKalemi)
router.get('/:id/serefiye', requireProjectAccess('user'), projelerController.getSerefiye)

// 7. Proje Temel Rotaları
router.get('/:id', requireProjectAccess('user'), projelerController.getProjeById)
// Yeni proje oluşturma — Sprint yetkili-role-system (PR-A, 2026-05-22):
//   authMiddleware parent router'da; ek olarak `requireYetkili` ile sadece
//   admin VEYA yetkili global rolüne sahip kullanıcı geçer (aksi 403).
//   RLS politikası (projeler_insert) zaten is_yetkili() check'ini yapıyor;
//   middleware ile defensive in-depth + erken hata mesajı sağlıyoruz.
//   trg_auto_owner_on_proje_insert trigger'ı yine auto-owner atar.
router.post('/', requireYetkili, validate({ body: projeSchema }), projelerController.createProje)
// Proje meta düzenleme — manager+ (proje adı/durumu/parametreleri)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateProjeSchema }), projelerController.updateProje)

// 8. Sprint proje-silme-akisi (2026-05-24): İki aşamalı silme.
//    - Önizleme + Arşivle + Geri Al: owner+ (global admin owner gibi geçer).
//    - Kalıcı sil: owner+ guard; veri varsa "sadece admin" kuralı controller içinde.
router.get('/:id/silme-onizleme', requireProjectAccess('owner'), projelerController.getSilmeOnizleme)
router.post('/:id/arsivle', requireProjectAccess('owner'), validate({ body: arsivleProjeSchema }), projelerController.arsivleProje)
router.post('/:id/geri-al', requireProjectAccess('owner'), projelerController.geriAlProje)
router.delete('/:id', requireProjectAccess('owner'), validate({ body: kaliciSilProjeSchema }), projelerController.kaliciSilProje)

// 9. Sprint desktop-offline-mode (2026-05-26): proje çevrimdışı moduna alma.
//    Yalnız owner çağırabilir. Service offline_mode_set_at +
//    offline_mode_owner_id alanlarını otomatik doldurur. Desktop kardeş
//    uygulaması (Electron) bu endpoint'i kullanır; web tarafında UI yok
//    ama backend desteklenir (file:// scheme'de relatif /api çözmediği
//    için desktop client absolute backend URL'sine ulaşır).
router.patch(
  '/:id/offline-mode',
  requireProjectAccess('owner'),
  validate({ body: offlineModeSchema }),
  projelerController.setOfflineMode,
)

export default router
