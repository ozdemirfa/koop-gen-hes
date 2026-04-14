import { Router } from 'express'
import * as raporlarController from '../controllers/raporlar.controller'

const router = Router()

router.get('/aylik-rapor', raporlarController.getAylikRapor)
router.get('/aylik-rapor/pdf', raporlarController.downloadAylikRaporPdf)
router.get('/yillik-rapor', raporlarController.getYillikRapor)
router.get('/uye-borc-listesi', raporlarController.getUyeBorcListesi)
router.get('/hakedis-ozet', raporlarController.getHakedisOzet)

export default router
