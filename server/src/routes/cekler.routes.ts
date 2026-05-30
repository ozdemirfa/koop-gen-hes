import { Router } from 'express'
import { validate } from '../middleware/validate'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import { cekSchema, updateCekSchema, cekDurumSchema } from '../schemas/cek.schema'
import * as ceklerController from '../controllers/cekler.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET/POST/PUT/PATCH → user
//   (Çek silme endpoint'i yok; durum değişimi PATCH manager olabilir ama mevcut
//    workflow'da user'a açık tutuluyor — durum revize edilirse manager'a alınır.)
router.get('/', requireProjectAccess('user'), ceklerController.getCekler)
router.get('/:id', requireProjectAccess('user'), ceklerController.getCekById)

router.post('/', requireProjectAccess('manager'), validate({ body: cekSchema }), ceklerController.createCek)
router.put('/:id', requireProjectAccess('manager'), validate({ body: updateCekSchema }), ceklerController.updateCek)
router.patch('/:id/durum', requireProjectAccess('manager'), validate({ body: cekDurumSchema }), ceklerController.updateCekDurum)
router.patch('/:id/pay', requireProjectAccess('manager'), ceklerController.payCek)

export default router
