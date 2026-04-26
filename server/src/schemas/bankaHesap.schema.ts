import { z } from 'zod'
import { ISLEM_TIPLERI, ODEME_YONTEMLERI } from '../config/constants'

export const bankaHesapSchema = z.object({
  proje_id: z.string().uuid().optional().nullable(),
  banka_adi: z.string().min(1, 'Banka adı zorunlu'),
  sube: z.string().optional().nullable(),
  hesap_no: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  aktif: z.boolean().optional()
})

export const bankaHareketiSchema = z.object({
  banka_hesap_id: z.string().uuid(),
  tarih: z.string(),
  tutar: z.number().positive(),
  islem_tipi: z.enum(ISLEM_TIPLERI),
  aciklama: z.string().optional().nullable(),
  firma_id: z.string().uuid().optional().nullable(),
  odeme_yontemi: z.enum(ODEME_YONTEMLERI).optional().default('banka')
})

export const bankaEsleSchema = z.object({
  eslesen_cari_hareket_id: z.string().uuid()
})
