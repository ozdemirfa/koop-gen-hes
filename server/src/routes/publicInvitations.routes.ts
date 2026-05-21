/**
 * Public davet endpoint'leri — auth GEREKTİRMEZ.
 *
 * Mount: /api/invitations (server/src/index.ts'te apiRoutes'tan ÖNCE,
 * authMiddleware'i bypass edecek şekilde direkt app.use ile).
 *
 * Korumalar:
 *   - IP rate-limit middleware (5/dk + 30/saat)
 *   - Token-bazlı kimlik doğrulama (token bulunmazsa 404)
 *   - Attempt-lockout (5 yanlış OTP → expired)
 */

import { Router } from 'express'
import {
  inviteAcceptMinuteLimiter,
  inviteAcceptHourlyLimiter,
} from '../middleware/invitationRateLimit'
import {
  previewInvitation,
  acceptInvitationByToken,
} from '../controllers/publicInvitations.controller'

const router = Router()

router.get(
  '/by-token/:token',
  inviteAcceptMinuteLimiter,
  inviteAcceptHourlyLimiter,
  previewInvitation,
)
router.post(
  '/accept-by-token',
  inviteAcceptMinuteLimiter,
  inviteAcceptHourlyLimiter,
  acceptInvitationByToken,
)

export default router
