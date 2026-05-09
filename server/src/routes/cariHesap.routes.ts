import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { cariHareketSchema, cariPaymentSchema } from '../schemas/cariHesap.schema'
import * as cariHesapController from '../controllers/cariHesap.controller'

const router = Router()

router.get('/', cariHesapController.getCariHareketler)
router.get('/accounts', cariHesapController.getCariHesaplar)
router.post('/', requireRole('staff'), validate({ body: cariHareketSchema }), cariHesapController.createCariHareket)
router.post('/payment', requireRole('staff'), validate({ body: cariPaymentSchema }), cariHesapController.createPayment)
router.post('/fifo-kapama', requireRole('admin'), cariHesapController.performFifoClosure)
router.post('/:id/undo-closure', requireRole('admin'), cariHesapController.undoClosure)
router.post('/hakedis/:id/undo-closure', requireRole('admin'), cariHesapController.undoHakedisClosure)

export default router
