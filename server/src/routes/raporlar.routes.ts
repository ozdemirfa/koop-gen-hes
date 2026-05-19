import { Router } from 'express'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import * as raporlarController from '../controllers/raporlar.controller'

const router = Router()

router.get('/aylik-rapor', requireProjectAccess('viewer'), raporlarController.getAylikRapor)
router.get('/aylik-rapor/pdf', requireProjectAccess('viewer'), raporlarController.downloadAylikRaporPdf)
router.get('/yillik-rapor', requireProjectAccess('viewer'), raporlarController.getYillikRapor)
router.get('/uye-borc-listesi', requireProjectAccess('viewer'), raporlarController.getUyeBorcListesi)
router.get('/hakedis-ozet', requireProjectAccess('viewer'), raporlarController.getHakedisOzet)
router.get('/mizan', requireProjectAccess('viewer'), raporlarController.getMizan)

export default router
