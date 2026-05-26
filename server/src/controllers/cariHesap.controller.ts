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

// IDOR fix (security-quality-sprint, 2026-05-26): extractProjeId helper.
function extractProjeId(req: AuthRequest<any, any, any, any>): string {
  const fromBody = (req.body as any)?.proje_id ?? (req.body as any)?.projeId
  const fromQuery = (req.query as any)?.proje_id ?? (req.query as any)?.projeId
  const fromParams = (req.params as any)?.projeId ?? (req.params as any)?.proje_id
  const raw = fromBody ?? fromQuery ?? fromParams
  return typeof raw === 'string' ? raw : ''
}

export const undoClosure = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.undoClosure(id, extractProjeId(req), req.user?.id)
    res.json(data)
  }
)

export const undoHakedisClosure = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.undoHakedisClosure(id, extractProjeId(req), req.user?.id)
    res.json(data)
  }
)

// A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
export const undoAidatClosure = catchAsync(
  async (req: AuthRequest<{ aidatId: string }>, res: Response) => {
    const { aidatId } = req.params
    const data = await cariHesapService.undoAidatClosure(aidatId, extractProjeId(req), req.user?.id)
    res.json(data)
  }
)

// Başlangıç bedeli tahakkuk bazında toplu undo (UyeDetailPage virtual row için).
export const undoBaslangicBedeliClosure = catchAsync(
  async (req: AuthRequest<{ tahakkukId: string }>, res: Response) => {
    const { tahakkukId } = req.params
    const data = await cariHesapService.undoBaslangicBedeliClosure(tahakkukId, extractProjeId(req), req.user?.id)
    res.json(data)
  }
)

// B2 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenle.
export const updateCariHareket = catchAsync(
  async (req: AuthRequest<{ id: string }, unknown, Record<string, unknown>>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.update(id, req.body as Record<string, any>, extractProjeId(req))
    res.json({ success: true, data })
  }
)

// B1 + B3 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı sil.
export const deleteCariHareket = catchAsync(
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const { id } = req.params
    const data = await cariHesapService.delete(id, extractProjeId(req))
    res.json(data)
  }
)

// Sprint uyelik-baslangic-iptal-duzenle (2026-05-25):
export const updateUyelikBaslangicTahakkuk = catchAsync(
  async (
    req: AuthRequest<
      { tahakkukId: string },
      unknown,
      { tutar: number; tarih: string; aciklama?: string | null; proje_id?: string; projeId?: string }
    >,
    res: Response,
  ) => {
    const { tahakkukId } = req.params
    const { tutar, tarih, aciklama } = req.body
    const data = await cariHesapService.updateUyelikBaslangicTahakkuk(
      tahakkukId,
      { tutar, tarih, aciklama },
      extractProjeId(req),
      req.user?.id,
    )
    res.json({ success: true, data })
  },
)

// DELETE /cari-hareketler/baslangic-bedeli/:tahakkukId — tahakkuku iptal et.
export const deleteUyelikBaslangicTahakkuk = catchAsync(
  async (req: AuthRequest<{ tahakkukId: string }>, res: Response) => {
    const { tahakkukId } = req.params
    const data = await cariHesapService.deleteUyelikBaslangicTahakkuk(
      tahakkukId,
      extractProjeId(req),
      req.user?.id,
    )
    res.json(data)
  },
)

