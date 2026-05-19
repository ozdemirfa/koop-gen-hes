import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { blokSchema } from '../schemas/uye.schema'
import * as blokController from '../controllers/blok.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), blokController.getBloklar)
router.post('/', requireProjectAccess('staff'), validate({ body: blokSchema }), blokController.createBlok)
router.put('/:id', requireProjectAccess('staff'), validate({ body: blokSchema.partial() }), blokController.updateBlok)
router.delete('/:id', requireProjectAccess('staff'), blokController.deleteBlok)

export default router
