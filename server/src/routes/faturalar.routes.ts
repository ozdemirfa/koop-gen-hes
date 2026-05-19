import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createFaturaSchema, updateFaturaSchema } from '../schemas/fatura.schema'
import * as faturaController from '../controllers/faturalar.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), faturaController.getFaturalar)
router.get('/:id', requireProjectAccess('viewer'), faturaController.getFaturaById)

router.post('/', requireProjectAccess('staff'), validate({ body: createFaturaSchema }), faturaController.createFatura)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateFaturaSchema }), faturaController.updateFatura)
// Fatura silme finansal etki yaratır — global admin only
router.delete('/:id', requireRole('admin'), requireProjectAccess('viewer'), faturaController.deleteFatura)

export default router
