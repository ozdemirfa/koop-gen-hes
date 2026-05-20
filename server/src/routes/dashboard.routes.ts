import { Router } from 'express'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import * as dashboardController from '../controllers/dashboard.controller'

const router = Router()

// Sprint role-system-modernization (PR-B):
//   GET → user (her üye dashboard görür)
router.get('/ozet', requireProjectAccess('user'), dashboardController.getOzet)
router.get('/aidat-durumu', requireProjectAccess('user'), dashboardController.getAidatDurumu)

export default router
