import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { validate } from '../middleware/validate'
import { birimSchema, pozSchema } from '../schemas/settings.schema'
import {
  getBirimler,
  createBirim,
  deleteBirim,
  getPozlar,
  createPoz,
  updatePoz,
  deletePoz
} from '../controllers/settings.controller'

import uyelerRoutes from './uyeler.routes'
import bloklarRoutes from './bloklar.routes'
import aidatlarRoutes from './aidatlar.routes'
import firmalarRoutes from './firmalar.routes'
import sozlesmelerRoutes from './sozlesmeler.routes'
import hakedislerRoutes from './hakedisler.routes'
import faturalarRoutes from './faturalar.routes'
import cariHesapRoutes from './cariHesap.routes'
import bankaHesapRoutes from './bankaHesap.routes'
import malzemeTeslimRoutes from './malzemeTeslim.routes'
import projelerRoutes from './projeler.routes'
import dashboardRoutes from './dashboard.routes'
import raporlarRoutes from './raporlar.routes'
import ceklerRoutes from './cekler.routes'

const router = Router()

// Tüm API route'ları auth middleware ile korunuyor
router.use(authMiddleware)

// === SETTINGS (Integrated) ===
router.get('/settings/birimler', getBirimler)
router.post('/settings/birimler', requireRole('admin'), validate({ body: birimSchema }), createBirim)
router.delete('/settings/birimler/:id', requireRole('admin'), deleteBirim)
router.get('/settings/pozlar', getPozlar)
router.post('/settings/pozlar', requireRole('admin'), validate({ body: pozSchema }), createPoz)
router.put('/settings/pozlar/:id', requireRole('admin'), validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/settings/pozlar/:id', requireRole('admin'), deletePoz)

// Modül route'ları
router.use('/uyeler', uyelerRoutes)
router.use('/bloklar', bloklarRoutes)
router.use('/aidatlar', aidatlarRoutes)
router.use('/firmalar', firmalarRoutes)
router.use('/sozlesmeler', sozlesmelerRoutes)
router.use('/hakedisler', hakedislerRoutes)
router.use('/faturalar', faturalarRoutes)
router.use('/cari-hareketler', cariHesapRoutes)
router.use('/banka', bankaHesapRoutes)
router.use('/malzeme-teslimleri', malzemeTeslimRoutes)
router.use('/projeler', projelerRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/raporlar', raporlarRoutes)
router.use('/cekler', ceklerRoutes)

export default router
