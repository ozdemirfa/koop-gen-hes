import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
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
import adminRoutes from './admin.routes'
import projeUyelikleriRoutes from './projeUyelikleri.routes'
import virmanRoutes from './virman.routes'

const router = Router()

// Tüm API route'ları auth middleware ile korunuyor
router.use(authMiddleware)

// === AUTH (Self) ===
// GET /api/auth/me — frontend AuthContext'in global rol bilgisini almak için.
router.get('/auth/me', (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user?.id,
      email: req.user?.email,
      role: req.userRole ?? null,
    },
  })
})

// === SETTINGS (Integrated) ===
// Sprint role-system-modernization (PR-B): Birim/poz master-data global ölçekli;
// proje-bazlı 3-rol modeline taşınmıyor. Backend tarafında authMiddleware
// yeterli; manager+ gating frontend tarafında uygulanır (Settings sayfası
// PR-C'de role guard ile sınırlandırılacak).
router.get('/settings/birimler', getBirimler)
router.post('/settings/birimler', validate({ body: birimSchema }), createBirim)
router.delete('/settings/birimler/:id', deleteBirim)
router.get('/settings/pozlar', getPozlar)
router.post('/settings/pozlar', validate({ body: pozSchema }), createPoz)
router.put('/settings/pozlar/:id', validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/settings/pozlar/:id', deletePoz)

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
// Proje üyelik alt-route'u projeler ana router'ından önce mount edilmeli; aksi
// halde `/projeler/:id` catch-all önce eşleşir.
router.use('/projeler/:projeId/uyeler', projeUyelikleriRoutes)
router.use('/projeler', projelerRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/raporlar', raporlarRoutes)
router.use('/cekler', ceklerRoutes)
router.use('/admin', adminRoutes)
router.use('/virmanlar', virmanRoutes)

export default router
