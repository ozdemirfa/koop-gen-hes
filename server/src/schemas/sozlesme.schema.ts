import { z } from 'zod'

export const createSozlesmeSchema = z.object({
  proje_id: z.string().uuid().optional(),
  firma_id: z.string().uuid(),
  sozlesme_no: z.string().optional().nullable(),
  konu: z.string().min(1, 'Konu zorunlu'),
  toplam_tutar: z.number().positive('Toplam tutar pozitif olmalı'),
  baslangic_tarihi: z.string().optional().nullable(),
  bitis_tarihi: z.string().optional().nullable(),
  teminat_orani: z.number().min(0).max(100).optional(),
  stopaj_orani: z.number().min(0).max(100).optional(),
  notlar: z.string().optional().nullable()
})

export const updateSozlesmeSchema = createSozlesmeSchema.partial()

export const isKalemiSchema = z.object({
  poz_no: z.string().optional().nullable(),
  tanim: z.string().min(1, 'Tanım zorunlu'),
  birim: z.string().min(1, 'Birim zorunlu'),
  miktar: z.number().positive('Miktar pozitif olmalı'),
  birim_fiyat: z.number().min(0, 'Birim fiyat negatif olamaz'),
  sira_no: z.number().int().optional()
})
