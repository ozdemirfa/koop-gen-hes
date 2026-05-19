import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { cariHareketSchema, cariPaymentSchema } from '../schemas/cariHesap.schema'
import * as cariHesapController from '../controllers/cariHesap.controller'

const router = Router()

router.get('/', requireProjectAccess('viewer'), cariHesapController.getCariHareketler)
router.get('/accounts', requireProjectAccess('viewer'), cariHesapController.getCariHesaplar)
router.post('/', requireProjectAccess('staff'), validate({ body: cariHareketSchema }), cariHesapController.createCariHareket)
router.post('/payment', requireProjectAccess('staff'), validate({ body: cariPaymentSchema }), cariHesapController.createPayment)
// FIFO ve undo işlemleri finansal yapıyı değiştirir — global admin only
router.post('/fifo-kapama', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.performFifoClosure)
router.post('/:id/undo-closure', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.undoClosure)
router.post('/hakedis/:id/undo-closure', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.undoHakedisClosure)
// A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
router.post('/aidat/:aidatId/undo-closure', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.undoAidatClosure)
// Başlangıç bedeli tahakkuk bazında toplu undo (UyeDetailPage virtual row).
router.post('/baslangic-bedeli/:tahakkukId/undo-closure', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.undoBaslangicBedeliClosure)
// B1+B2+B3 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenle/sil
// (kilit kontrolü servis katmanında 409 ile döner).
router.patch('/:id', requireProjectAccess('staff'), cariHesapController.updateCariHareket)
router.delete('/:id', requireRole('admin'), requireProjectAccess('viewer'), cariHesapController.deleteCariHareket)

export default router
