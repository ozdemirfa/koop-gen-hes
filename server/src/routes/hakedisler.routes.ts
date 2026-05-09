import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { createHakedisSchema, updateHakedisSchema, hakedisKalemlerBatchSchema } from '../schemas/hakedis.schema'
import * as hakedisController from '../controllers/hakedisler.controller'

const router = Router()

router.get('/', hakedisController.getHakedisler)
router.get('/:id', hakedisController.getHakedisById)
router.get('/:id/pdf', hakedisController.downloadHakedisPdf)
router.post('/', requireRole('admin'), validate({ body: createHakedisSchema }), hakedisController.createHakedis)
router.put('/:id', requireRole('admin'), validate({ body: updateHakedisSchema }), hakedisController.updateHakedis)
router.put('/:id/onayla', requireRole('admin'), hakedisController.approveHakedis)
router.put('/:id/onay-iptal', requireRole('admin'), hakedisController.unapproveHakedis)
router.post('/:id/kalemler', requireRole('staff'), validate({ body: hakedisKalemlerBatchSchema }), hakedisController.updateKalemler)

export default router
