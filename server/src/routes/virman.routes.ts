import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { virmanCreateSchema } from '../schemas/virman.schema'
import * as virmanController from '../controllers/virman.controller'

const router = Router()

// Sprint 20260520-virman-feature:
// GET viewer, mutate staff (proje izolasyon middleware'i proje_id zorunlu kılar).
router.get('/', requireProjectAccess('viewer'), virmanController.listVirmanlar)
router.post('/', requireProjectAccess('staff'), validate({ body: virmanCreateSchema }), virmanController.createVirman)
router.delete('/:id', requireProjectAccess('staff'), virmanController.deleteVirman)

export default router
