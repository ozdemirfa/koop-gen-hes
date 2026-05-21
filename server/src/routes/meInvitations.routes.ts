/**
 * Kullanıcının kendi davetleri — banner + ProjeListPage bekleyen davetler section.
 * Mount: /api/me/invitations (apiRoutes altında authMiddleware ile)
 */

import { Router } from 'express'
import {
  listMyInvitations,
  acceptMyInvitation,
  rejectMyInvitation,
} from '../controllers/meInvitations.controller'

const router = Router()

router.get('/', listMyInvitations)
router.post('/:id/accept', acceptMyInvitation)
router.post('/:id/reject', rejectMyInvitation)

export default router
