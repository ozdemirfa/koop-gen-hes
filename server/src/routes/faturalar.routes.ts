import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createFaturaSchema, updateFaturaSchema } from '../schemas/fatura.schema'
import * as faturaController from '../controllers/faturalar.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT → user
//   DELETE       → manager (finansal etki)
router.get('/', requireProjectAccess('user'), faturaController.getFaturalar)
router.get('/:id', requireProjectAccess('user'), faturaController.getFaturaById)

router.post('/', requireProjectAccess('manager'), validate({ body: createFaturaSchema }), faturaController.createFatura)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateFaturaSchema }), faturaController.updateFatura)
router.delete('/:id', requireProjectAccess('manager'), faturaController.deleteFatura)

export default router
