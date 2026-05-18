import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { bankaHesapSchema, bankaHareketiSchema, bankaEsleSchema } from '../schemas/bankaHesap.schema'
import * as bankaHesapController from '../controllers/bankaHesap.controller'

const router = Router()

// Banka hesapları
router.get('/hesaplar', requireProjectAccess('viewer'), bankaHesapController.getHesaplar)
router.post('/hesaplar', requireProjectAccess('staff'), validate({ body: bankaHesapSchema }), bankaHesapController.createHesap)
router.put('/hesaplar/:id', requireProjectAccess('staff'), validate({ body: bankaHesapSchema }), bankaHesapController.updateHesap)

// Banka hareketleri
router.get('/hareketler', requireProjectAccess('viewer'), bankaHesapController.getHareketler)
router.post('/hareketler', requireProjectAccess('staff'), validate({ body: bankaHareketiSchema }), bankaHesapController.createHareket)
router.put('/hareketler/:id/esle', requireProjectAccess('staff'), validate({ body: bankaEsleSchema }), bankaHesapController.esleHareket)

export default router
