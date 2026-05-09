import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { createFirmaSchema, updateFirmaSchema } from '../schemas/firma.schema'
import * as firmaController from '../controllers/firma.controller'

const router = Router()

router.get('/', firmaController.getFirmalar)
router.get('/stats', firmaController.getStats)
router.get('/:id/stats', firmaController.getFirmaStats)
router.get('/:id', firmaController.getFirmaById)
router.post('/', requireRole('staff'), validate({ body: createFirmaSchema }), firmaController.createFirma)
router.put('/:id', requireRole('staff'), validate({ body: updateFirmaSchema }), firmaController.updateFirma)
router.get('/:id/cari-ekstre', firmaController.getCariEkstre)

export default router
