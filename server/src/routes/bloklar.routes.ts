import { Router } from 'express'
import { validate } from '../middleware/validate'
import { blokSchema } from '../schemas/uye.schema'
import * as blokController from '../controllers/blok.controller'

const router = Router()

router.get('/', blokController.getBloklar)

router.post('/', validate({ body: blokSchema }), blokController.createBlok)

router.put('/:id', validate({ body: blokSchema.partial() }), blokController.updateBlok)

router.delete('/:id', blokController.deleteBlok)

export default router
