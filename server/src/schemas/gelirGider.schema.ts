import { z } from 'zod'
import { ISLEM_TIPLERI } from '../config/constants'

export const kategoriSchema = z.object({
  ad: z.string().min(1, 'Kategori adı zorunlu'),
  tip: z.enum(ISLEM_TIPLERI),
  ust_kategori_id: z.string().uuid().optional().nullable()
})

export const gelirGiderSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  tip: z.enum(ISLEM_TIPLERI),
  kategori_id: z.string().uuid('Kategori seçimi zorunlu'),
  tutar: z.number().positive('Tutar pozitif olmalı'),
  tarih: z.string().optional(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable(),
  uye_id: z.string().uuid().optional().nullable(),
  firma_id: z.string().uuid().optional().nullable(),
  kaynak_tipi: z.string().optional().nullable(),
  kaynak_id: z.string().uuid().optional().nullable()
})

export const updateGelirGiderSchema = gelirGiderSchema.partial()
