import { z } from 'zod'
import { ISLEM_TIPLERI, ODEME_YONTEMLERI } from '../config/constants'

export const bankaHesapSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  banka_adi: z.string().min(1, 'Banka adı zorunlu'),
  sube: z.string().optional().nullable(),
  // hesap_no: 7 haneli sayı (girilirse). Boş/null kabul edilir.
  hesap_no: z
    .union([z.string().regex(/^\d{7}$/, 'Hesap no 7 haneli sayı olmalı'), z.literal(''), z.null(), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : v))
    .nullable()
    .optional(),
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
