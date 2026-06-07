import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { createKurumSchema, updateKurumSchema, kurumPaymentSchema } from '../schemas/kurum.schema'
import * as kurumController from '../controllers/kurum.controller'

const router = Router()

// Sprint kurumsal-cari-revizyonlar (2026-06-07): Kurumlar owner-bazlı (firmalar
// pattern'i). Okuma proje-aware (requireProjectAccess('user')); yazma + ödeme
// manager+. proje_id X-Active-Project-Id header / query'den okunur.
router.get('/', requireProjectAccess('user'), kurumController.getKurumlar)
router.get('/:id', requireProjectAccess('user'), kurumController.getKurumById)
router.get('/:id/cari-ekstre', requireProjectAccess('user'), kurumController.getKurumCariEkstre)
router.post('/', requireProjectAccess('manager'), validate({ body: createKurumSchema }), kurumController.createKurum)
router.post('/odeme', requireProjectAccess('manager'), validate({ body: kurumPaymentSchema }), kurumController.createKurumPayment)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateKurumSchema }), kurumController.updateKurum)
router.delete('/:id', requireProjectAccess('manager'), kurumController.deleteKurum)

export default router
