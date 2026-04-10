import { z } from 'zod'
import { ISLEM_TIPLERI } from '../config/constants'

export const kategoriSchema = z.object({
  ad: z.string().min(1, 'Kategori adı zorunlu'),
  tip: z.enum(ISLEM_TIPLERI),
  ust_kategori_id: z.string().uuid().optional().nullable()
})

export const gelirGiderSchema = z.object({
  tip: z.enum(ISLEM_TIPLERI),
  kategori_id: z.string().uuid('Kategori seçimi zorunlu'),
  tutar: z.number().positive('Tutar pozitif olmalı'),
  tarih: z.string().optional(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable(),
  ilgili_firma: z.string().optional().nullable()
})

export const updateGelirGiderSchema = gelirGiderSchema.partial()
