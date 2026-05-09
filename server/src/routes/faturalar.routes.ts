import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { createFaturaSchema, updateFaturaSchema } from '../schemas/fatura.schema'
import * as faturaController from '../controllers/faturalar.controller'

const router = Router()

router.get('/', faturaController.getFaturalar)
router.get('/:id', faturaController.getFaturaById)

router.use(requireRole('admin'))

router.post('/', validate({ body: createFaturaSchema }), faturaController.createFatura)
router.put('/:id', validate({ body: updateFaturaSchema }), faturaController.updateFatura)
router.delete('/:id', faturaController.deleteFatura)

export default router
