import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createSozlesmeSchema, updateSozlesmeSchema, isKalemiSchema } from '../schemas/sozlesme.schema'
import * as sozlesmeController from '../controllers/sozlesmeler.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), sozlesmeController.getSozlesmeler)
router.get('/:id', requireProjectAccess('viewer'), sozlesmeController.getSozlesmeById)
router.post('/', requireProjectAccess('staff'), validate({ body: createSozlesmeSchema }), sozlesmeController.createSozlesme)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateSozlesmeSchema }), sozlesmeController.updateSozlesme)
router.delete('/:id', requireProjectAccess('staff'), sozlesmeController.deleteSozlesme)

// İş kalemleri — proje_id query üzerinden gelir
router.get('/:id/is-kalemleri', requireProjectAccess('viewer'), sozlesmeController.getIsKalemleri)
router.post('/:id/is-kalemleri', requireProjectAccess('staff'), validate({ body: isKalemiSchema }), sozlesmeController.addIsKalemi)
router.put('/is-kalemleri/:id', requireProjectAccess('staff'), validate({ body: isKalemiSchema.partial() }), sozlesmeController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireProjectAccess('staff'), sozlesmeController.deleteIsKalemi)

export default router
