import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createFaturaSchema, updateFaturaSchema, odemePlaniSchema } from '../schemas/fatura.schema'
import * as faturaController from '../controllers/faturalar.controller'

const router = Router()

router.get('/', faturaController.getFaturalar)
router.get('/:id', faturaController.getFaturaById)
router.post('/', validate({ body: createFaturaSchema }), faturaController.createFatura)
router.put('/:id', validate({ body: updateFaturaSchema }), faturaController.updateFatura)
router.delete('/:id', faturaController.deleteFatura)
router.post('/:id/odeme-plani', validate({ body: odemePlaniSchema }), faturaController.createOdemePlani)

export default router
