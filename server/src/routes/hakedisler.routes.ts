import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createHakedisSchema, updateHakedisSchema, hakedisKalemlerBatchSchema } from '../schemas/hakedis.schema'
import * as hakedisController from '../controllers/hakedisler.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), hakedisController.getHakedisler)
router.get('/:id', requireProjectAccess('viewer'), hakedisController.getHakedisById)
router.get('/:id/pdf', requireProjectAccess('viewer'), hakedisController.downloadHakedisPdf)

router.post('/', requireProjectAccess('staff'), validate({ body: createHakedisSchema }), hakedisController.createHakedis)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateHakedisSchema }), hakedisController.updateHakedis)
router.put('/:id/onayla', requireProjectAccess('staff'), hakedisController.approveHakedis)
// Onay iptali finansal etki yaratır — global admin only
router.put('/:id/onay-iptal', requireRole('admin'), requireProjectAccess('viewer'), hakedisController.unapproveHakedis)
router.post('/:id/kalemler', requireProjectAccess('staff'), validate({ body: hakedisKalemlerBatchSchema }), hakedisController.updateKalemler)

// Alternatif A: irsaliye → hakediş bağ kurma
router.post('/:id/irsaliyeler', requireProjectAccess('staff'), hakedisController.attachIrsaliyeler)
router.delete('/:id/irsaliyeler/:irsaliyeId', requireProjectAccess('staff'), hakedisController.detachIrsaliye)

export default router
