import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { irsaliyeSchema, updateIrsaliyeSchema } from '../schemas/malzemeTeslim.schema'
import * as malzemeTeslimController from '../controllers/malzemeTeslim.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT → user
//   DELETE       → manager
router.get('/', requireProjectAccess('user'), malzemeTeslimController.getMalzemeTeslim)
router.get('/:id', requireProjectAccess('user'), malzemeTeslimController.getMalzemeTeslimById)

router.post('/', requireProjectAccess('manager'), validate({ body: irsaliyeSchema }), malzemeTeslimController.createMalzemeTeslim)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateIrsaliyeSchema }), malzemeTeslimController.updateMalzemeTeslim)
router.delete('/:id', requireProjectAccess('manager'), malzemeTeslimController.deleteMalzemeTeslim)

export default router
