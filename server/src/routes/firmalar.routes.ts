import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createFirmaSchema, updateFirmaSchema } from '../schemas/firma.schema'
import * as firmaController from '../controllers/firma.controller'

const router = Router()

// Firma master-data global ölçekli (tüm projeler paylaşır). PR-B kapsamında
// `requireRole('staff')` guard'ı kaldırılıyor — yeni 3-rol modeli proje-bazlı,
// global rol kavramı kalkıyor (faz 3'te user_roles tablosu DROP edilecek).
// Erişim: authenticated → herhangi bir kullanıcı CRUD yapabilir.
//
// Sprint firmalar-offline-lock (2026-05-26):
//   POST/PUT mutation'larına requireProjectAccess('user') mount edildi. Amaç:
//   aktif projesi offline_mode=true olan non-owner kullanıcıların firma
//   ekleme/güncelleme'sini 403 ile engellemek (defense in depth — frontend
//   canEdit zaten butonu disable ediyor; bu MW backend cap'i koyar).
//   proje_id `X-Active-Project-Id` header'ından okunur (interceptor her istekte
//   gönderir). Firma kaydı global kalır; sadece WRITE gating proje-aware'dir.
router.get('/', firmaController.getFirmalar)
router.get('/stats', firmaController.getStats)
router.get('/:id/stats', firmaController.getFirmaStats)
router.get('/:id', firmaController.getFirmaById)
router.post('/', requireProjectAccess('user'), validate({ body: createFirmaSchema }), firmaController.createFirma)
router.put('/:id', requireProjectAccess('user'), validate({ body: updateFirmaSchema }), firmaController.updateFirma)
// Sprint revizyon-bugfix-paketi B2 (2026-05-25, P0): cari-ekstre proje-bagli;
// requireProjectAccess proje_id'yi query'den dogrular ve uyelik kontrolu yapar.
router.get('/:id/cari-ekstre', requireProjectAccess('user'), firmaController.getCariEkstre)

export default router
