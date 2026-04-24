import { Router } from 'express'
import { validate } from '../middleware/validate'
import { cariHareketSchema, cariPaymentSchema } from '../schemas/cariHesap.schema'
import * as cariHesapController from '../controllers/cariHesap.controller'

const router = Router()

router.get('/', cariHesapController.getCariHareketler)
router.get('/accounts', cariHesapController.getCariHesaplar)
router.post('/', validate({ body: cariHareketSchema }), cariHesapController.createCariHareket)
router.post('/payment', validate({ body: cariPaymentSchema }), cariHesapController.createPayment)

export default router
