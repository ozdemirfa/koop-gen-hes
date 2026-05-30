import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createSozlesmeSchema, updateSozlesmeSchema, isKalemiSchema } from '../schemas/sozlesme.schema'
import * as sozlesmeController from '../controllers/sozlesmeler.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT → user
//   DELETE       → manager
router.get('/', requireProjectAccess('user'), sozlesmeController.getSozlesmeler)
router.get('/:id', requireProjectAccess('user'), sozlesmeController.getSozlesmeById)
router.post('/', requireProjectAccess('manager'), validate({ body: createSozlesmeSchema }), sozlesmeController.createSozlesme)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateSozlesmeSchema }), sozlesmeController.updateSozlesme)
router.delete('/:id', requireProjectAccess('manager'), sozlesmeController.deleteSozlesme)

// İş kalemleri — proje_id query üzerinden gelir
router.get('/:id/is-kalemleri', requireProjectAccess('user'), sozlesmeController.getIsKalemleri)
router.post('/:id/is-kalemleri', requireProjectAccess('manager'), validate({ body: isKalemiSchema }), sozlesmeController.addIsKalemi)
router.put('/is-kalemleri/:id', requireProjectAccess('manager'), validate({ body: isKalemiSchema.partial() }), sozlesmeController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireProjectAccess('manager'), sozlesmeController.deleteIsKalemi)

export default router
