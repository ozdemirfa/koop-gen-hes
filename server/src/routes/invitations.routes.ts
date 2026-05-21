/**
 * Owner/manager perspektifinden proje davetleri.
 * Mount: /api/projeler/:projeId/invitations (apiRoutes altında authMiddleware ile)
 */

import { Router } from 'express'
import { requireProjectAccess } from '../middleware/requireProjectAccess'
import {
  createInvitation,
  listInvitations,
  cancelInvitation,
} from '../controllers/invitations.controller'

// mergeParams: parent router'dan :projeId taşınır
const router = Router({ mergeParams: true })

// Tüm endpoint'ler proje izolasyon middleware'inden geçer.
// Read için user+ yeterli (manager + user görür); create/cancel için manager+.
router.get('/', requireProjectAccess('user'), listInvitations)
router.post('/', requireProjectAccess('manager'), createInvitation)
router.delete('/:id', requireProjectAccess('manager'), cancelInvitation)

export default router
