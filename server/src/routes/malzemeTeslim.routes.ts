import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { irsaliyeSchema, updateIrsaliyeSchema } from '../schemas/malzemeTeslim.schema'
import * as malzemeTeslimController from '../controllers/malzemeTeslim.controller'

const router = Router()

router.get('/', malzemeTeslimController.getMalzemeTeslim)
router.get('/:id', malzemeTeslimController.getMalzemeTeslimById)

router.use(requireRole('staff'))

router.post('/', validate({ body: irsaliyeSchema }), malzemeTeslimController.createMalzemeTeslim)
router.put('/:id', validate({ body: updateIrsaliyeSchema }), malzemeTeslimController.updateMalzemeTeslim)
router.delete('/:id', malzemeTeslimController.deleteMalzemeTeslim)

export default router
