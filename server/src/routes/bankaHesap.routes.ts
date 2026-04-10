import { Router, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { bankaHesapSchema, bankaHareketiSchema, bankaEsleSchema } from '../schemas/bankaHesap.schema'
import { bankaHesapService } from '../services/bankaHesap.service'

const router = Router()

// Banka hesapları
router.get('/hesaplar', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await bankaHesapService.listHesaplar()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/hesaplar', validate({ body: bankaHesapSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await bankaHesapService.createHesap(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// Banka hareketleri
router.get('/hareketler', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await bankaHesapService.listHareketler(req.query as Record<string, any>)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.post('/hareketler', validate({ body: bankaHareketiSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await bankaHesapService.createHareket(req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
})

// Banka hareketi ↔ cari hareket eşleştirme
router.put('/hareketler/:id/esle', validate({ body: bankaEsleSchema }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await bankaHesapService.esle(req.params.id, req.body.eslesen_cari_hareket_id)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
