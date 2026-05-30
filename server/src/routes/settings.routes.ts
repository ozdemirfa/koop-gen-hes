import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireCreateGlobalDefs } from '../middleware/requireRole'
import { birimSchema, pozSchema } from '../schemas/settings.schema'
import {
  getBirimler,
  createBirim,
  deleteBirim,
  getPozlar,
  createPoz,
  updatePoz,
  deletePoz
} from '../controllers/settings.controller'

const router = Router()

// Sprint birim-poz-user-scope (2026-05-27):
//   Hibrit model: global (kullanici_id NULL) + kişisel (kullanici_id = user.id).
//
// Sprint user-role-readonly (2026-05-30):
//   `user` proje rolü artık SALT-OKUNUR — kişisel birim/poz dahil HİÇBİR
//   tanım oluşturamaz/düzenleyemez. Tüm yazma route'ları `requireCreateGlobalDefs`
//   (admin/yetkili global rol VEYA herhangi bir projede owner/manager) gerektirir.
//   Saf `user` (hiçbir projede manager+ değil) 403 alır.
//
//   - GET        : tüm authenticated (auth middleware app-level) — service userId'ye
//                  göre filtreler (global + kullanıcının kendi kayıtları).
//   - POST/PUT/DELETE: requireCreateGlobalDefs. Service katmanı ayrıca sahiplik/
//                  global ayrımını uygular (assertOwnershipOrAdmin, defense-in-depth).

// Birimler
router.get('/birimler', getBirimler)
router.post('/birimler', requireCreateGlobalDefs, validate({ body: birimSchema }), createBirim)
router.delete('/birimler/:id', requireCreateGlobalDefs, deleteBirim)

// Pozlar
router.get('/pozlar', getPozlar)
router.post('/pozlar', requireCreateGlobalDefs, validate({ body: pozSchema }), createPoz)
router.put('/pozlar/:id', requireCreateGlobalDefs, validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/pozlar/:id', requireCreateGlobalDefs, deletePoz)

export default router
