import { Router, RequestHandler } from 'express'
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
//   - GET    : tüm authenticated (auth middleware app-level) — service userId'ye
//              göre filtreler (global + kullanıcının kendi kayıtları).
//   - POST   : tüm authenticated kişisel ekleyebilir; is_global=true ise
//              requireCreateGlobalDefsIfGlobal middleware admin/yetkili/manager olmasını şart koşar.
//   - PUT/DELETE: admin tüm kayıtlar; non-admin yalnız kendi kayıtları (service-level check).

/**
 * is_global=true ise requireCreateGlobalDefs zorla; aksi takdirde
 * (kişisel ekleme) tüm authenticated kullanıcıya açık.
 *
 * Not: validate() henüz çalışmadan body raw — req.body.is_global doğrudan
 * okunur. Schema default = false; truthy kontrolü explicit.
 */
const requireCreateGlobalDefsIfGlobal: RequestHandler = (req, res, next) => {
  const isGlobal = req.body && (req.body as any).is_global === true
  if (!isGlobal) {
    next()
    return
  }
  // Delegate to existing guard — admin/yetkili/any-manager geçer
  return requireCreateGlobalDefs(req, res, next)
}

// Birimler
router.get('/birimler', getBirimler)
router.post(
  '/birimler',
  validate({ body: birimSchema }),
  requireCreateGlobalDefsIfGlobal,
  createBirim
)
// DELETE: yetki kontrolü service katmanında (admin OR sahibi) — sadece auth gerekli
router.delete('/birimler/:id', deleteBirim)

// Pozlar
router.get('/pozlar', getPozlar)
router.post(
  '/pozlar',
  validate({ body: pozSchema }),
  requireCreateGlobalDefsIfGlobal,
  createPoz
)
// PUT/DELETE: yetki kontrolü service katmanında (admin OR sahibi)
router.put('/pozlar/:id', validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/pozlar/:id', deletePoz)

export default router
