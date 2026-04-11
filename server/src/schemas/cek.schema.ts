import { z } from 'zod'

export const cekSchema = z.object({
  firma_id: z.string().uuid('Firma seçimi zorunlu'),
  proje_id: z.string().uuid().optional().nullable(),
  cek_no: z.string().min(1, 'Çek no zorunlu'),
  banka: z.string().min(1, 'Banka adı zorunlu'),
  sube: z.string().optional().nullable(),
  tutar: z.number().positive('Tutar pozitif olmalı'),
  vade_tarihi: z.string(),
  keside_tarihi: z.string().optional(),
  durum: z.enum(['beklemede', 'odendi', 'iade', 'iptal']).optional(),
  aciklama: z.string().optional().nullable()
})

export const updateCekSchema = cekSchema.partial()

export const cekDurumSchema = z.object({
  durum: z.enum(['beklemede', 'odendi', 'iade', 'iptal'])
})
