import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import {
  cariHareketSchema,
  cariPaymentSchema,
  cariHareketListQuerySchema,
  uyelikBaslangicUpdateSchema,
} from '../schemas/cariHesap.schema'
import * as cariHesapController from '../controllers/cariHesap.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET                 → user
//   POST/PATCH          → user   (tahsilat girişi + düzenleme form akışı)
//   fifo-kapama / undo  → manager (finansal yapıyı değiştirir)
//   DELETE              → manager
router.get(
  '/',
  requireProjectAccess('user'),
  validate({ query: cariHareketListQuerySchema }),
  cariHesapController.getCariHareketler,
)
router.get('/accounts', requireProjectAccess('user'), cariHesapController.getCariHesaplar)
router.post('/', requireProjectAccess('user'), validate({ body: cariHareketSchema }), cariHesapController.createCariHareket)
router.post('/payment', requireProjectAccess('user'), validate({ body: cariPaymentSchema }), cariHesapController.createPayment)
// FIFO ve undo işlemleri finansal yapıyı değiştirir — manager+
router.post('/fifo-kapama', requireProjectAccess('manager'), cariHesapController.performFifoClosure)
router.post('/:id/undo-closure', requireProjectAccess('manager'), cariHesapController.undoClosure)
router.post('/hakedis/:id/undo-closure', requireProjectAccess('manager'), cariHesapController.undoHakedisClosure)
// A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
router.post('/aidat/:aidatId/undo-closure', requireProjectAccess('manager'), cariHesapController.undoAidatClosure)
// Başlangıç bedeli tahakkuk bazında toplu undo (UyeDetailPage virtual row).
router.post('/baslangic-bedeli/:tahakkukId/undo-closure', requireProjectAccess('manager'), cariHesapController.undoBaslangicBedeliClosure)
// Sprint uyelik-baslangic-iptal-duzenle (2026-05-25): tahakkuk satiri duzenle/iptal.
// Tahsilat bagi varsa servis 409 ile engeller (P0001 → ApiError.conflict).
// :tahakkukId routes'u :id'den ONCE tanimlanmali — Express regex match order
// `/cari-hareketler/baslangic-bedeli/<id>` istegini generic `/:id` route'una
// dusurmemek icin.
router.patch(
  '/baslangic-bedeli/:tahakkukId',
  requireProjectAccess('manager'),
  validate({ body: uyelikBaslangicUpdateSchema }),
  cariHesapController.updateUyelikBaslangicTahakkuk,
)
router.delete(
  '/baslangic-bedeli/:tahakkukId',
  requireProjectAccess('manager'),
  cariHesapController.deleteUyelikBaslangicTahakkuk,
)
// B1+B2+B3 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenle/sil
// (kilit kontrolü servis katmanında 409 ile döner).
router.patch('/:id', requireProjectAccess('user'), cariHesapController.updateCariHareket)
router.delete('/:id', requireProjectAccess('manager'), cariHesapController.deleteCariHareket)

export default router
