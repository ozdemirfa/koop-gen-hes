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
  // proje_id interceptor tarafından body'ye enjekte edilir; validate strip etmesin diye
  // şemada bulunmalı (yoksa extractProjeId boş döner → "proje_id zorunludur" 400).
  proje_id: z.string().uuid().optional(),
  donem_baslangic: z.string().optional().nullable(),
  donem_bitis: z.string().optional().nullable(),
  diger_kesintiler: z.number().min(0).optional(),
  aciklama: z.string().optional().nullable()
})

export const hakedisKalemSchema = z.object({
  is_kalemi_id: z.string().uuid(),
  bu_ay_miktar: z.number().min(0, 'Miktar negatif olamaz'),
  birim_fiyat: z.number().min(0),
  kdv_orani: z.number().min(0).max(100).optional(),
  onceki_miktar: z.number().min(0).optional()
})

export const hakedisKalemlerBatchSchema = z.object({
  // proje_id interceptor tarafından body'ye enjekte edilir; validate strip etmesin diye
  // şemada bulunmalı (yoksa extractProjeId boş döner → "proje_id zorunludur" 400).
  proje_id: z.string().uuid().optional(),
  kalemler: z.array(hakedisKalemSchema).min(1, 'En az bir kalem gerekli')
})
