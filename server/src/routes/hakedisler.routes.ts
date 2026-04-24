import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createHakedisSchema, updateHakedisSchema, hakedisKalemlerBatchSchema } from '../schemas/hakedis.schema'
import * as hakedisController from '../controllers/hakedisler.controller'

const router = Router()

router.get('/', hakedisController.getHakedisler)
router.get('/:id', hakedisController.getHakedisById)
router.get('/:id/pdf', hakedisController.downloadHakedisPdf)
router.post('/', validate({ body: createHakedisSchema }), hakedisController.createHakedis)
router.put('/:id', validate({ body: updateHakedisSchema }), hakedisController.updateHakedis)
router.put('/:id/onayla', hakedisController.approveHakedis)
router.put('/:id/onay-iptal', hakedisController.unapproveHakedis)
router.post('/:id/kalemler', validate({ body: hakedisKalemlerBatchSchema }), hakedisController.updateKalemler)

export default router
