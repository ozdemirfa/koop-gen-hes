import { z } from 'zod'

export const malzemeTeslimSchema = z.object({
  firma_id: z.string().uuid().optional().nullable(),
  sozlesme_id: z.string().uuid().optional().nullable(),
  teslim_tarihi: z.string().optional(),
  malzeme_adi: z.string().min(1, 'Malzeme adı zorunlu'),
  malzeme_tipi: z.string().optional().nullable(),
  birim: z.string().min(1, 'Birim zorunlu'),
  miktar: z.number().positive('Miktar pozitif olmalı'),
  birim_fiyat: z.number().min(0),
  teslim_alan: z.string().optional().nullable(),
  irsaliye_no: z.string().optional().nullable(),
  notlar: z.string().optional().nullable()
})

export const updateMalzemeTeslimSchema = malzemeTeslimSchema.partial()
