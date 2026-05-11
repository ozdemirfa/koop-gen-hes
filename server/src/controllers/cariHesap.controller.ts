import { Response } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middleware/auth'
import { cariHesapService } from '../services/cariHesap.service'
import { catchAsync } from '../utils/catchAsync'
import { cariHareketSchema, cariPaymentSchema } from '../schemas/cariHesap.schema'

// TASK-BE-10 (sprint 20260511-backlog-batch3, CODE-002):
// AuthRequest generic'leri 'any' yerine Zod-derive types. Refactor sırasında
// schema/controller arası tip kayması erken yakalanır.
type CariHareketBody = z.infer<typeof cariHareketSchema>
type CariPaymentBody = z.infer<typeof cariPaymentSchema>
type FifoClosureBody = { proje_id: string }
type CariListQuery = Record<string, string | string[] | undefined>

export const getCariHareketler = catchAsync(
  async (req: AuthRequest<Record<string, never>, unknown, unknown, CariListQuery>, res: Response) => {
    const data = await cariHesapService.list(req.query as Record<string, any>)
    res.json({ success: true, data })
  }
)

export const getCariHesaplar = catchAsync(
  async (req: AuthRequest<Record<string, never>, unknown, unknown, CariListQuery>, res: Response) => {
    const data = await cariHesapService.listAccounts(req.query as Record<string, any>)
    res.json({ success: true, data })
  }
)

export const createCariHareket = catchAsync(
  async (req: AuthRequest<Record<string, never>, unknown, CariHareketBody>, res: Response) => {
    const data = await cariHesapService.create(req.body)
    res.status(201).json({ success: true, data })
  }
)

export const createPayment = catchAsync(
  async (req: AuthRequest<Record<string, never>, unknown, CariPaymentBody>, res: Response) => {
    const data = await cariHesapService.createPayment({ ...req.body, actorId: req.user?.id })
    res.status(201).json({ success: true, data })
  }
)

export const performFifoClosure = catchAsync(
  async (req: AuthRequest<Record<string, never>, unknown, FifoClosureBody>, res: Response) => {
    const { proje_id } = req.body
    const data = await cariHesapService.performFifoClosure(proje_id, req.user?.id)
    res.json({ success: true, data })
  }
)

export const undoClosure = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.undoClosure(id, req.user?.id)
    res.json(data)
  }
)

export const undoHakedisClosure = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.undoHakedisClosure(id, req.user?.id)
    res.json(data)
  }
)

// A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
export const undoAidatClosure = catchAsync(
  async (req: AuthRequest<{ aidatId: string }>, res: Response) => {
    const { aidatId } = req.params
    const data = await cariHesapService.undoAidatClosure(aidatId, req.user?.id)
    res.json(data)
  }
)

// B2 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenle.
export const updateCariHareket = catchAsync(
  async (req: AuthRequest<{ id: string }, unknown, Record<string, unknown>>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.update(id, req.body as Record<string, any>)
    res.json({ success: true, data })
  }
)

// B1 + B3 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı sil.
export const deleteCariHareket = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.delete(id)
    res.json(data)
  }
)

