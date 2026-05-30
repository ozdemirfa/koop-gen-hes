import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createUyeSchema, updateUyeSchema } from '../schemas/uye.schema'
import * as uyeController from '../controllers/uye.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT     → user
//   DELETE           → manager
//   bulkPayment      → user (toplu tahsilat — form girişi)
//   match-payments   → manager (FIFO eşleşme yıkıcı/değiştirici)
router.get('/', requireProjectAccess('user'), uyeController.getUyes)
router.get('/:id', requireProjectAccess('user'), uyeController.getUyeById)

router.post('/', requireProjectAccess('manager'), validate({ body: createUyeSchema }), uyeController.createUye)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateUyeSchema }), uyeController.updateUye)
router.delete('/:id', requireProjectAccess('manager'), uyeController.deleteUye)

router.get('/:id/aidatlar', requireProjectAccess('user'), uyeController.getUyeAidatlar)

router.post('/:id/toplu-odeme', requireProjectAccess('manager'), uyeController.bulkPayment)
router.post('/:id/match-payments', requireProjectAccess('manager'), uyeController.matchPaymentsFIFO)

export default router
