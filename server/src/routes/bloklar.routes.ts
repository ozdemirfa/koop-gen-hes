import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { blokSchema } from '../schemas/uye.schema'
import * as blokController from '../controllers/blok.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT → user
//   DELETE       → manager
router.get('/', requireProjectAccess('user'), blokController.getBloklar)
router.post('/', requireProjectAccess('user'), validate({ body: blokSchema }), blokController.createBlok)
router.put('/:id', requireProjectAccess('user'), validate({ body: blokSchema.partial() }), blokController.updateBlok)
router.delete('/:id', requireProjectAccess('manager'), blokController.deleteBlok)

export default router
