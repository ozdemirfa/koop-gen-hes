import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createSozlesmeSchema, updateSozlesmeSchema, isKalemiSchema } from '../schemas/sozlesme.schema'
import * as sozlesmeController from '../controllers/sozlesmeler.controller'

const router = Router()

router.get('/', sozlesmeController.getSozlesmeler)
router.get('/:id', sozlesmeController.getSozlesmeById)
router.post('/', validate({ body: createSozlesmeSchema }), sozlesmeController.createSozlesme)
router.put('/:id', validate({ body: updateSozlesmeSchema }), sozlesmeController.updateSozlesme)
router.delete('/:id', sozlesmeController.deleteSozlesme)

// İş kalemleri
router.get('/:id/is-kalemleri', sozlesmeController.getIsKalemleri)
router.post('/:id/is-kalemleri', validate({ body: isKalemiSchema }), sozlesmeController.addIsKalemi)
router.put('/is-kalemleri/:id', validate({ body: isKalemiSchema.partial() }), sozlesmeController.updateIsKalemi)
router.delete('/is-kalemleri/:id', sozlesmeController.deleteIsKalemi)

export default router
