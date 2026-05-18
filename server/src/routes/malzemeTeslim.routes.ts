import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { irsaliyeSchema, updateIrsaliyeSchema } from '../schemas/malzemeTeslim.schema'
import * as malzemeTeslimController from '../controllers/malzemeTeslim.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), malzemeTeslimController.getMalzemeTeslim)
router.get('/:id', requireProjectAccess('viewer'), malzemeTeslimController.getMalzemeTeslimById)

router.post('/', requireProjectAccess('staff'), validate({ body: irsaliyeSchema }), malzemeTeslimController.createMalzemeTeslim)
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateIrsaliyeSchema }), malzemeTeslimController.updateMalzemeTeslim)
router.delete('/:id', requireProjectAccess('staff'), malzemeTeslimController.deleteMalzemeTeslim)

export default router
