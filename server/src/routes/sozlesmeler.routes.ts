import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { createSozlesmeSchema, updateSozlesmeSchema, isKalemiSchema } from '../schemas/sozlesme.schema'
import * as sozlesmeController from '../controllers/sozlesmeler.controller'

const router = Router()

router.get('/', sozlesmeController.getSozlesmeler)
router.get('/:id', sozlesmeController.getSozlesmeById)
router.post('/', requireRole('admin'), validate({ body: createSozlesmeSchema }), sozlesmeController.createSozlesme)
router.put('/:id', requireRole('admin'), validate({ body: updateSozlesmeSchema }), sozlesmeController.updateSozlesme)
router.delete('/:id', requireRole('admin'), sozlesmeController.deleteSozlesme)

// İş kalemleri
router.get('/:id/is-kalemleri', sozlesmeController.getIsKalemleri)
router.post('/:id/is-kalemleri', requireRole('admin'), validate({ body: isKalemiSchema }), sozlesmeController.addIsKalemi)
router.put('/is-kalemleri/:id', requireRole('admin'), validate({ body: isKalemiSchema.partial() }), sozlesmeController.updateIsKalemi)
router.delete('/is-kalemleri/:id', requireRole('admin'), sozlesmeController.deleteIsKalemi)

export default router
