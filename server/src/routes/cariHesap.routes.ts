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
// A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
router.post('/aidat/:aidatId/undo-closure', requireRole('admin'), cariHesapController.undoAidatClosure)
// B1+B2+B3 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenle/sil
// (kilit kontrolü servis katmanında 409 ile döner).
router.patch('/:id', requireRole('staff'), cariHesapController.updateCariHareket)
router.delete('/:id', requireRole('admin'), cariHesapController.deleteCariHareket)

export default router
