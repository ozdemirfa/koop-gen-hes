import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import {
  yonetimEkibiCreateSchema,
  yonetimEkibiUpdateSchema,
  yonetimPaymentSchema,
} from '../schemas/yonetimEkibi.schema'
import * as yonetimController from '../controllers/yonetimEkibi.controller'

const router = Router()

// Sprint yonetim-ekibi (2026-05-30): 3-rol permission matrix (virman ile aynı)
//   GET     → user    (her üye okur)
//   POST    → user    (form girişi user'a açık)
//   PATCH   → user    (düzenleme)
//   DELETE  → manager (yıkıcı işlem)
//   POST /payment → user (ödeme kaydı)
router.get('/', requireProjectAccess('user'), yonetimController.listYonetim)
router.post('/', requireProjectAccess('manager'), validate({ body: yonetimEkibiCreateSchema }), yonetimController.createYonetim)
router.post('/payment', requireProjectAccess('manager'), validate({ body: yonetimPaymentSchema }), yonetimController.createYonetimPayment)
router.patch('/:id', requireProjectAccess('manager'), validate({ body: yonetimEkibiUpdateSchema }), yonetimController.updateYonetim)
router.delete('/:id', requireProjectAccess('manager'), yonetimController.deleteYonetim)

export default router
