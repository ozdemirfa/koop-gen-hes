import { Router } from 'express'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import * as dashboardController from '../controllers/dashboard.controller'

const router = Router()

router.get('/ozet', requireProjectAccess('viewer'), dashboardController.getOzet)
router.get('/aidat-durumu', requireProjectAccess('viewer'), dashboardController.getAidatDurumu)

export default router
