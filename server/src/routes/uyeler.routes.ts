import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createUyeSchema, updateUyeSchema } from '../schemas/uye.schema'
import * as uyeController from '../controllers/uye.controller'

const router = Router()

// GET /api/uyeler
router.get('/', requireProjectAccess('viewer'), uyeController.getUyes)

// GET /api/uyeler/:id
router.get('/:id', requireProjectAccess('viewer'), uyeController.getUyeById)

// POST /api/uyeler
router.post('/', requireProjectAccess('staff'), validate({ body: createUyeSchema }), uyeController.createUye)

// PUT /api/uyeler/:id
router.put('/:id', requireProjectAccess('staff'), validate({ body: updateUyeSchema }), uyeController.updateUye)

// DELETE /api/uyeler/:id
router.delete('/:id', requireProjectAccess('staff'), uyeController.deleteUye)

// GET /api/uyeler/:id/aidatlar
router.get('/:id/aidatlar', requireProjectAccess('viewer'), uyeController.getUyeAidatlar)

// POST /api/uyeler/:id/toplu-odeme
router.post('/:id/toplu-odeme', requireProjectAccess('staff'), uyeController.bulkPayment)

// POST /api/uyeler/:id/match-payments
router.post('/:id/match-payments', requireProjectAccess('staff'), uyeController.matchPaymentsFIFO)

export default router
