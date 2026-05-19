import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { upsertProjeUyeligiSchema, updateProjeUyeligiRoluSchema } from '../schemas/admin.schema'
import * as projeUyelikController from '../controllers/projeUyelik.controller'

// Bu router /api/projeler altına `/:projeId/uyeler` prefix'i ile bağlanacak.
// projeler.routes.ts ile çakışmaması için ayrı bir router olarak tutuluyor;
// routes/index.ts içinde `router.use('/projeler/:projeId/uyeler', ...)` ile
// mount edilir. Express `mergeParams` ile :projeId çocuk router'a yansır.
const router = Router({ mergeParams: true })

// GET /:projeId/uyeler/me — viewer+ ile kendi rolünü gör. Membership UI dışı
// frontend rol bilinci için kullanılır; admin endpoint değil.
router.get('/me', projeUyelikController.getMyRole)

// Aşağıdaki tüm endpoint'ler global admin yetkisi gerektirir.
router.use(requireRole('admin'))

router.get('/', projeUyelikController.listMembers)
router.post('/', validate({ body: upsertProjeUyeligiSchema }), projeUyelikController.upsertMember)
router.patch('/:userId', validate({ body: updateProjeUyeligiRoluSchema }), projeUyelikController.updateMemberRole)
router.delete('/:userId', projeUyelikController.removeMember)

export default router
