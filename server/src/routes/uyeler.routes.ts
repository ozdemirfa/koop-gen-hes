import { Router } from 'express'
import { validate } from '../middleware/validate'
import { createUyeSchema, updateUyeSchema } from '../schemas/uye.schema'
import * as uyeController from '../controllers/uye.controller'

const router = Router()

// GET /api/uyeler
router.get('/', uyeController.getUyes)

// GET /api/uyeler/:id
router.get('/:id', uyeController.getUyeById)

// POST /api/uyeler
router.post('/', validate({ body: createUyeSchema }), uyeController.createUye)

// PUT /api/uyeler/:id
router.put('/:id', validate({ body: updateUyeSchema }), uyeController.updateUye)

// DELETE /api/uyeler/:id
router.delete('/:id', uyeController.deleteUye)

// GET /api/uyeler/:id/aidatlar
router.get('/:id/aidatlar', uyeController.getUyeAidatlar)

// POST /api/uyeler/:id/toplu-odeme
router.post('/:id/toplu-odeme', uyeController.bulkPayment)

export default router
