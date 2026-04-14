import { Router } from 'express'
import * as dashboardController from '../controllers/dashboard.controller'

const router = Router()

router.get('/ozet', dashboardController.getOzet)
router.get('/aylik-gelir-gider', dashboardController.getAylikGelirGider)
router.get('/aidat-durumu', dashboardController.getAidatDurumu)

export default router
