import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireRole } from '../middleware/requireRole'
import { bankaHesapSchema, bankaHareketiSchema, bankaEsleSchema } from '../schemas/bankaHesap.schema'
import * as bankaHesapController from '../controllers/bankaHesap.controller'

const router = Router()

// Banka hesapları
router.get('/hesaplar', bankaHesapController.getHesaplar)
router.post('/hesaplar', requireRole('admin'), validate({ body: bankaHesapSchema }), bankaHesapController.createHesap)
router.put('/hesaplar/:id', requireRole('admin'), validate({ body: bankaHesapSchema }), bankaHesapController.updateHesap)

// Banka hareketleri
router.get('/hareketler', bankaHesapController.getHareketler)
router.post('/hareketler', requireRole('staff'), validate({ body: bankaHareketiSchema }), bankaHesapController.createHareket)
router.put('/hareketler/:id/esle', requireRole('staff'), validate({ body: bankaEsleSchema }), bankaHesapController.esleHareket)

export default router
