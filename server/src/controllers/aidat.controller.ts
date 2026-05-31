import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { aidatTanimiService, aidatService } from '../services/aidat.service'
import { catchAsync } from '../utils/catchAsync'

// IDOR fix (security-quality-sprint, 2026-05-26): proje_id extract helper
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = req.body?.proje_id ?? req.body?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

// === AİDAT TANIMLARI ===

export const getAidatTanimlari = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // NOT: Eskiden burada otomatik borçlandırma (executeCharging) çalıştırılırdı.
  // Bu yan etki, manuel "Borçlandırmayı Geri Al" işlemini anında bozuyordu
  // (geri alınan 'plan' tanım, liste yenilenince tekrar borçlandırılıyordu).
  // Borçlandırma artık yalnızca manuel "Borçlandır" butonu (/borclandir) veya
  // açık toplu /execute-charging endpoint'i ile yapılır.
  const data = await aidatTanimiService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.createTanim(req.body)
  res.status(201).json({ success: true, data })
})

export const createYillikPlan = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.createYillikPlan(req.body, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const updateAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.updateTanim(req.params.id, req.body, extractProjeId(req))
  res.json({ success: true, data })
})

export const deleteAidatTanimi = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.deleteTanim(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const chargeTanim = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.chargeTanim(req.params.id, req.user?.id)
  res.json({ success: true, data })
})

export const executeCharging = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.executeCharging(req.body.date, req.user?.id)
  res.json({ success: true, data })
})

export const unchargeTanim = catchAsync(async (req: AuthRequest<{ id: string }, any, any, any>, res: Response) => {
  const data = await aidatTanimiService.unchargeTanim(req.params.id, extractProjeId(req), req.user?.id)
  res.json({ success: true, data })
})

export const bulkChargeInterest = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const { aidat_ids } = req.body
  const data = await aidatTanimiService.bulkChargeInterest(aidat_ids, req.user?.id)
  res.json({ success: true, data })
})

// === AİDATLAR ===

export const getAidatlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const result = await aidatService.list(req.query as Record<string, any>)
  res.json({ success: true, ...result })
})

export const getAidatOzet = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.getSummary(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const calculateLateFees = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.calculateLateFees(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const calculateSingleLateFee = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.calculateSingleLateFee(req.params.id, req.user?.id)
  res.json({ success: true, data })
})

export const toggleInterest = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const { active } = req.body
  const data = await aidatService.toggleInterest(req.params.id, active, req.user?.id)
  res.json({ success: true, data })
})

export const getAidatById = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.getById(req.params.id, extractProjeId(req))
  res.json({ success: true, data })
})

export const recordPayment = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.recordPayment(req.params.id, req.body, extractProjeId(req), req.user?.id)
  res.json({ success: true, data })
})

export const deleteAidat = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.deleteAidat(req.params.id, extractProjeId(req), req.user?.id)
  res.json({ success: true, data })
})

export const updateAidatRow = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await aidatService.updateAidatRow(req.params.id, req.body, extractProjeId(req), req.user?.id)
  res.json({ success: true, data })
})
