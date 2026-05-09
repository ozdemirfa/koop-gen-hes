import { z } from 'zod'
import { FATURA_TIPLERI, FATURA_DURUMLARI } from '../config/constants'

export const faturaKalemiSchema = z.object({
  id: z.string().uuid().optional(),
  kalem_adi: z.string().min(1, 'Kalem adı zorunlu'),
  birim: z.string().min(1, 'Birim zorunlu'),
  miktar: z.number().positive('Miktar pozitif olmalı'),
  birim_fiyat: z.number().positive('Birim fiyat pozitif olmalı'),
  kdv_orani: z.number().min(0).max(100).optional().default(20)
})

export const createFaturaSchema = z.object({
  firma_id: z.string().uuid('Firma seçimi zorunlu'),
  proje_id: z.string().uuid().optional().nullable(),
  fatura_tipi: z.enum(FATURA_TIPLERI),
  fatura_no: z.string().min(1, 'Fatura no zorunlu'),
  fatura_tarihi: z.string(),
  vade_tarihi: z.string().optional().nullable(),
  ara_toplam: z.number().min(0),
  kdv_tutar: z.number().min(0).optional(),
  toplam_tutar: z.number().positive(),
  durum: z.enum(FATURA_DURUMLARI).optional(),
  aciklama: z.string().optional().nullable(),
  hakedis_id: z.string().uuid().optional().nullable(),
  kalemler: z.array(faturaKalemiSchema).min(1, 'En az bir kalem eklenmelidir')
})

export const updateFaturaSchema = createFaturaSchema.partial()
