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
// Master-data düzenlemesi proje seviyesinde kısıtlanmadığı için bu PR'da
// gating'i frontend tarafına bırakıyoruz (Settings sayfası manager+ gating
// uygulayacak — PR-C). Backend tarafı authMiddleware (parent router) zaten yeterli.
router.get('/', firmaController.getFirmalar)
router.get('/stats', firmaController.getStats)
router.get('/:id/stats', firmaController.getFirmaStats)
router.get('/:id', firmaController.getFirmaById)
router.post('/', validate({ body: createFirmaSchema }), firmaController.createFirma)
router.put('/:id', validate({ body: updateFirmaSchema }), firmaController.updateFirma)
// Sprint revizyon-bugfix-paketi B2 (2026-05-25, P0): cari-ekstre proje-bagli;
// requireProjectAccess proje_id'yi query'den dogrular ve uyelik kontrolu yapar.
router.get('/:id/cari-ekstre', requireProjectAccess('user'), firmaController.getCariEkstre)

export default router
