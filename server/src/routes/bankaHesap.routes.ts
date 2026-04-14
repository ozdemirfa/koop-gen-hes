import { Router } from 'express'
import { validate } from '../middleware/validate'
import { bankaHesapSchema, bankaHareketiSchema, bankaEsleSchema } from '../schemas/bankaHesap.schema'
import * as bankaHesapController from '../controllers/bankaHesap.controller'

const router = Router()

// Banka hesapları
router.get('/hesaplar', bankaHesapController.getHesaplar)
router.post('/hesaplar', validate({ body: bankaHesapSchema }), bankaHesapController.createHesap)
router.put('/hesaplar/:id', validate({ body: bankaHesapSchema }), bankaHesapController.updateHesap)

// Banka hareketleri
router.get('/hareketler', bankaHesapController.getHareketler)
router.post('/hareketler', validate({ body: bankaHareketiSchema }), bankaHesapController.createHareket)
router.put('/hareketler/:id/esle', validate({ body: bankaEsleSchema }), bankaHesapController.esleHareket)

export default router
