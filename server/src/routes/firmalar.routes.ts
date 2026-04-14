import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createFirmaSchema, updateFirmaSchema } from '../schemas/firma.schema'
import * as firmaController from '../controllers/firma.controller'

const router = Router()

router.get('/', firmaController.getFirmalar)
router.get('/:id', firmaController.getFirmaById)
router.post('/', validate({ body: createFirmaSchema }), firmaController.createFirma)
router.put('/:id', validate({ body: updateFirmaSchema }), firmaController.updateFirma)
router.get('/:id/cari-ekstre', firmaController.getCariEkstre)

export default router
