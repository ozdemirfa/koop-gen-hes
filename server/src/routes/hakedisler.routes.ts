import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createHakedisSchema, updateHakedisSchema, hakedisKalemlerBatchSchema } from '../schemas/hakedis.schema'
import * as hakedisController from '../controllers/hakedisler.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET             → user
//   POST/PUT        → user (form girişi + edit)
//   onayla          → user (workflow ileri yön; ileri-geri 'onay-iptal' manager)
//   onay-iptal      → manager (geri alma / finansal etki revize)
//   irsaliyeler     → user (bağ kurma)
//   irsaliye detach → manager (yıkıcı bağ koparma)
router.get('/', requireProjectAccess('user'), hakedisController.getHakedisler)
router.get('/:id', requireProjectAccess('user'), hakedisController.getHakedisById)
router.get('/:id/pdf', requireProjectAccess('user'), hakedisController.downloadHakedisPdf)

router.post('/', requireProjectAccess('manager'), validate({ body: createHakedisSchema }), hakedisController.createHakedis)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateHakedisSchema }), hakedisController.updateHakedis)
router.put('/:id/onayla', requireProjectAccess('manager'), hakedisController.approveHakedis)
// Onay iptali finansal etki yaratır — manager+
router.put('/:id/onay-iptal', requireProjectAccess('manager'), hakedisController.unapproveHakedis)
// Hakediş silme — yıkıcı işlem (manager). Onaylı/ödenmiş hakediş service'te reddedilir.
router.delete('/:id', requireProjectAccess('manager'), hakedisController.deleteHakedis)
router.post('/:id/kalemler', requireProjectAccess('manager'), validate({ body: hakedisKalemlerBatchSchema }), hakedisController.updateKalemler)

// Alternatif A: irsaliye → hakediş bağ kurma
router.post('/:id/irsaliyeler', requireProjectAccess('manager'), hakedisController.attachIrsaliyeler)
router.delete('/:id/irsaliyeler/:irsaliyeId', requireProjectAccess('manager'), hakedisController.detachIrsaliye)

export default router
