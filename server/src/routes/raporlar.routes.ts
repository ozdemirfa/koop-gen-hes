import { Router } from 'express'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import * as raporlarController from '../controllers/raporlar.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   Tüm raporlar → user (her üye görür)
router.get('/aylik-rapor', requireProjectAccess('user'), raporlarController.getAylikRapor)
router.get('/aylik-rapor/pdf', requireProjectAccess('user'), raporlarController.downloadAylikRaporPdf)
router.get('/yillik-rapor', requireProjectAccess('user'), raporlarController.getYillikRapor)
router.get('/uye-borc-listesi', requireProjectAccess('user'), raporlarController.getUyeBorcListesi)
router.get('/hakedis-ozet', requireProjectAccess('user'), raporlarController.getHakedisOzet)
router.get('/mizan', requireProjectAccess('user'), raporlarController.getMizan)

export default router
