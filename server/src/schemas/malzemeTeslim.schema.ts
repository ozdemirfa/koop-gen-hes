import { z } from 'zod'

export const irsaliyeKalemiSchema = z.object({
  id: z.string().uuid().optional(),
  malzeme_adi: z.string().min(1, 'Malzeme adı zorunlu'),
  birim: z.string().min(1, 'Birim zorunlu'),
  miktar: z.number().positive('Miktar pozitif olmalı')
})

export const irsaliyeSchema = z.object({
  firma_id: z.string().uuid('Firma seçimi zorunlu'),
  sozlesme_id: z.string().uuid().optional().nullable(),
  hakedis_id: z.string().uuid().optional().nullable(),
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  teslim_tarihi: z.string().optional(),
  irsaliye_no: z.string().optional().nullable(),
  teslim_alan: z.string().optional().nullable(),
  notlar: z.string().optional().nullable(),
  kalemler: z.array(irsaliyeKalemiSchema).min(1, 'En az bir kalem eklenmelidir')
})

export const updateIrsaliyeSchema = irsaliyeSchema.partial()
