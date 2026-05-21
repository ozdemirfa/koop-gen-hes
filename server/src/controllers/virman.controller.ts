import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { virmanService } from '../services/virman.service'
import { catchAsync } from '../utils/catchAsync'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const listVirmanlar = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  const data = await virmanService.list(req.query as Record<string, any>)
  res.json({ success: true, data })
})

export const createVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // DIAGNOSTIC: virman proje_id bug — remove after fix
  logger.info('DIAGNOSTIC virman POST controller', {
    body: req.body,
    proje_id: req.body?.proje_id,
    proje_id_type: typeof req.body?.proje_id,
    body_keys: Object.keys(req.body || {}),
    content_type: req.headers['content-type'],
    user_id: req.user?.id,
  })

  // Defansif extraction: Zod 4 + .superRefine + supabase-js JSONB serialization
  // zincirinde proje_id'nin nerede kaybolduğu belirsiz olduğundan, payload'u
  // burada explicit yeniden inşa ediyoruz. body.projeId fallback'i camelCase
  // legacy istekler için.
  const body = (req.body || {}) as Record<string, unknown>
  const proje_id_raw = body.proje_id ?? body.projeId
  const proje_id =
    typeof proje_id_raw === 'string' ? proje_id_raw.trim() : ''

  if (!proje_id || !UUID_REGEX.test(proje_id)) {
    throw ApiError.badRequest('proje_id zorunludur', [
      {
        field: 'proje_id',
        message: `Geçerli proje_id gönderilmedi (alındı: ${typeof proje_id_raw})`,
      },
    ])
  }

  // body.virman_tipi vs. enum doğrulaması Zod validate katmanında yapıldı; burada
  // yalnızca tip cast ile servis input'una taşıyoruz.
  const serviceInput = {
    proje_id,
    virman_tipi: body.virman_tipi as 'banka_banka' | 'banka_nakit' | 'nakit_banka',
    kaynak_hesap_id: (body.kaynak_hesap_id ?? null) as string | null,
    hedef_hesap_id: (body.hedef_hesap_id ?? null) as string | null,
    tutar: body.tutar as number,
    tarih: body.tarih as string,
    aciklama: (body.aciklama ?? null) as string | null,
  }

  const data = await virmanService.create(serviceInput, req.user?.id)
  res.status(201).json({ success: true, data })
})

export const deleteVirman = catchAsync(async (req: AuthRequest<any, any, any, any>, res: Response) => {
  // proje_id query string'inden gelir; middleware aynı id'yi requireProjectAccess
  // ile doğrulamış olur → service tekrar eşleştirir (defense in depth).
  const projeId = String((req.query as any).proje_id || '')
  const data = await virmanService.remove(req.params.id, projeId)
  res.json({ success: true, data })
})
