import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { bankaHesapSchema, bankaHareketiSchema, bankaEsleSchema } from '../schemas/bankaHesap.schema'
import * as bankaHesapController from '../controllers/bankaHesap.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET    → user    (her üye okur)
//   POST   → user    (banka hesabı tanımı + hareket girişi user'a açık)
//   PUT    → user    (form düzenleme)
//   Eşleme → manager (banka↔cari eşlemesi yıkıcı/etki yaratan işlem)
router.get('/hesaplar', requireProjectAccess('user'), bankaHesapController.getHesaplar)
router.post('/hesaplar', requireProjectAccess('user'), validate({ body: bankaHesapSchema }), bankaHesapController.createHesap)
router.put('/hesaplar/:id', requireProjectAccess('user'), validate({ body: bankaHesapSchema }), bankaHesapController.updateHesap)

router.get('/hareketler', requireProjectAccess('user'), bankaHesapController.getHareketler)
router.post('/hareketler', requireProjectAccess('user'), validate({ body: bankaHareketiSchema }), bankaHesapController.createHareket)
// Eşleme iptal/değiştirme manager seviyesi
router.put('/hareketler/:id/esle', requireProjectAccess('manager'), validate({ body: bankaEsleSchema }), bankaHesapController.esleHareket)

export default router
