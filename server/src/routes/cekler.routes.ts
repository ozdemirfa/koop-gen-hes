import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { cekSchema, updateCekSchema, cekDurumSchema } from '../schemas/cek.schema'
import * as ceklerController from '../controllers/cekler.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), ceklerController.getCekler)
router.get('/:id', requireProjectAccess('viewer'), ceklerController.getCekById)

router.post('/', requireProjectAccess('staff'), validate({ body: cekSchema }), ceklerController.createCek)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateCekSchema }), ceklerController.updateCek)
router.patch('/:id/durum', requireProjectAccess('staff'), validate({ body: cekDurumSchema }), ceklerController.updateCekDurum)
router.patch('/:id/pay', requireProjectAccess('staff'), ceklerController.payCek)

export default router
