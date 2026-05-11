import { z } from 'zod'

export const createHakedisSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  sozlesme_id: z.string().uuid(),
  donem_baslangic: z.string().optional().nullable(),
  donem_bitis: z.string().optional().nullable(),
  diger_kesintiler: z.number().min(0).optional(),
  aciklama: z.string().optional().nullable()
})

export const updateHakedisSchema = z.object({
  donem_baslangic: z.string().optional().nullable(),
  donem_bitis: z.string().optional().nullable(),
  diger_kesintiler: z.number().min(0).optional(),
  aciklama: z.string().optional().nullable()
})

export const hakedisKalemSchema = z.object({
  is_kalemi_id: z.string().uuid(),
  bu_ay_miktar: z.number().min(0, 'Miktar negatif olamaz'),
  birim_fiyat: z.number().min(0)
})

export const hakedisKalemlerBatchSchema = z.object({
  kalemler: z.array(hakedisKalemSchema).min(1, 'En az bir kalem gerekli')
})
