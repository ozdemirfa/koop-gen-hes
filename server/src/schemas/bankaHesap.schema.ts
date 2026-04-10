import { z } from 'zod'
import { ISLEM_TIPLERI } from '../config/constants'

export const bankaHesapSchema = z.object({
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
  aciklama: z.string().optional().nullable()
})

export const bankaEsleSchema = z.object({
  eslesen_cari_hareket_id: z.string().uuid()
})
