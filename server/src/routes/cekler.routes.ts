import { Router } from 'express'
import { validate } from '../middleware/validate'
import { cekSchema, updateCekSchema, cekDurumSchema } from '../schemas/cek.schema'
import * as ceklerController from '../controllers/cekler.controller'

const router = Router()

router.get('/', ceklerController.getCekler)
router.get('/:id', ceklerController.getCekById)
router.post('/', validate({ body: cekSchema }), ceklerController.createCek)
router.put('/:id', validate({ body: updateCekSchema }), ceklerController.updateCek)
router.patch('/:id/durum', validate({ body: cekDurumSchema }), ceklerController.updateCekDurum)
router.patch('/:id/pay', ceklerController.payCek)

export default router
