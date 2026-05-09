import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { blokSchema } from '../schemas/uye.schema'
import * as blokController from '../controllers/blok.controller'

const router = Router()

router.get('/', blokController.getBloklar)

router.post('/', requireRole('admin'), validate({ body: blokSchema }), blokController.createBlok)

router.put('/:id', requireRole('admin'), validate({ body: blokSchema.partial() }), blokController.updateBlok)

router.delete('/:id', requireRole('admin'), blokController.deleteBlok)

export default router
