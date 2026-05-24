import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole, requireCreateGlobalDefs } from '../middleware/requireRole'
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

// Sprint birim-poz-yetki (2026-05-24):
//   Settings controller'lar supabaseAdmin client kullandığı için RLS bypass olur;
//   yetki kontrolü middleware seviyesinde manuel yapılır.
//   - GET   : tüm authenticated (auth middleware app-level)
//   - POST  : admin + yetkili + any project owner/manager (requireCreateGlobalDefs)
//   - PUT   : yalnız global admin
//   - DELETE: yalnız global admin

// Birimler
router.get('/birimler', getBirimler)
router.post('/birimler', requireCreateGlobalDefs, validate({ body: birimSchema }), createBirim)
router.delete('/birimler/:id', requireRole('admin'), deleteBirim)

// Pozlar
router.get('/pozlar', getPozlar)
router.post('/pozlar', requireCreateGlobalDefs, validate({ body: pozSchema }), createPoz)
router.put('/pozlar/:id', requireRole('admin'), validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/pozlar/:id', requireRole('admin'), deletePoz)

export default router
