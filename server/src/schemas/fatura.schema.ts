import { z } from 'zod'
import { FATURA_TIPLERI, FATURA_DURUMLARI } from '../config/constants'

export const createFaturaSchema = z.object({
  firma_id: z.string().uuid(),
  fatura_tipi: z.enum(FATURA_TIPLERI),
  fatura_no: z.string().min(1, 'Fatura no zorunlu'),
  fatura_tarihi: z.string(),
  vade_tarihi: z.string().optional().nullable(),
  ara_toplam: z.number().positive(),
  kdv_orani: z.number().min(0).max(100).optional(),
  kdv_tutar: z.number().min(0).optional(),
  toplam_tutar: z.number().positive(),
  durum: z.enum(FATURA_DURUMLARI).optional(),
  aciklama: z.string().optional().nullable(),
  hakedis_id: z.string().uuid().optional().nullable()
})

export const updateFaturaSchema = createFaturaSchema.partial()

export const odemePlaniSchema = z.object({
  taksitler: z.array(z.object({
    taksit_no: z.number().int().positive(),
    tutar: z.number().positive(),
    vade_tarihi: z.string()
  })).min(1, 'En az bir taksit gerekli')
})
