import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { upsertProjeUyeligiSchema, updateProjeUyeligiRoluSchema } from '../schemas/admin.schema'
import * as projeUyelikController from '../controllers/projeUyelik.controller'

// Bu router /api/projeler altına `/:projeId/uyeler` prefix'i ile bağlanacak.
// projeler.routes.ts ile çakışmaması için ayrı bir router olarak tutuluyor;
// routes/index.ts içinde `router.use('/projeler/:projeId/uyeler', ...)` ile
// mount edilir. Express `mergeParams` ile :projeId çocuk router'a yansır.
//
// Sprint role-system-modernization (PR-B):
//   GET /:projeId/uyeler/me  → herhangi bir üye (kendi rolünü okur)
//   GET /:projeId/uyeler     → manager+ (Kullanıcı Yönetimi sayfası listeleme)
//   upsert/patch/delete       → owner only (proje sahibi üyelik yönetimi)
//
// Legacy global admin requireRole('admin') guard'ı kaldırıldı; yerine
// proje-bazlı requireProjectAccess kullanılır. requireProjectAccess içindeki
// legacy fallback global admin'i hâlâ owner olarak kabul eder (faz 3'te
// kaldırılacak).
const router = Router({ mergeParams: true })

// GET /:projeId/uyeler/me — herhangi bir proje üyesi kendi rolünü görebilir.
router.get('/me', requireProjectAccess('user'), projeUyelikController.getMyRole)

router.get('/', requireProjectAccess('manager'), projeUyelikController.listMembers)
router.post('/', requireProjectAccess('owner'), validate({ body: upsertProjeUyeligiSchema }), projeUyelikController.upsertMember)
router.patch(
  '/:userId',
  requireProjectAccess('owner'),
  validate({ body: updateProjeUyeligiRoluSchema }),
  projeUyelikController.updateMemberRole,
)
router.delete('/:userId', requireProjectAccess('owner'), projeUyelikController.removeMember)

export default router
