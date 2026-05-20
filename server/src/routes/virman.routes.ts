import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { virmanCreateSchema } from '../schemas/virman.schema'
import * as virmanController from '../controllers/virman.controller'

const router = Router()

// Sprint role-system-modernization (PR-B): 3-rol permission matrix
//   GET    → user    (her üye okur)
//   POST   → user    (form girişi user'a açık)
//   DELETE → manager (yıkıcı işlem)
router.get('/', requireProjectAccess('user'), virmanController.listVirmanlar)
router.post('/', requireProjectAccess('user'), validate({ body: virmanCreateSchema }), virmanController.createVirman)
router.delete('/:id', requireProjectAccess('manager'), virmanController.deleteVirman)

export default router
