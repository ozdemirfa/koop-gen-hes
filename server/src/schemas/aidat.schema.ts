import { z } from 'zod'
import { AIDAT_DURUMLARI, ODEME_YONTEMLERI } from '../config/constants'

export const createAidatTanimiSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  yil: z.number().int().min(2020).max(2100),
  ay: z.number().int().min(1).max(12),
  tur: z.enum(['normal', 'ara_odeme']).default('normal'),
  katsayi_tutari: z.number().nonnegative('Katsayı tutarı tanımsız olamaz'),
  son_odeme_gunu: z.number().int().min(1).max(28).optional(),
  gecikme_faiz_orani: z.number().min(0).max(100).optional(),
  aciklama: z.string().optional().nullable()
})

export const yillikPlanSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  yil: z.number().int().min(2020).max(2100),
  kalemler: z.array(z.object({
    ay: z.number().int().min(1).max(12),
    tur: z.enum(['normal', 'ara_odeme']).default('normal'),
    katsayi_tutari: z.number().nonnegative('Katsayı tutarı tanımsız olamaz'),
    son_odeme_gunu: z.number().int().min(1).max(28).optional(),
    gecikme_faiz_orani: z.number().min(0).max(100).optional(),
    aciklama: z.string().optional().nullable()
  })).min(1, 'En az bir kalem olmalı')
})

export const updateAidatTanimiSchema = createAidatTanimiSchema.partial()

export const aidatOdemeSchema = z.object({
  tutar: z.number().positive('Ödeme tutarı pozitif olmalı'),
  odeme_tarihi: z.string().optional(),
  odeme_yontemi: z.enum(ODEME_YONTEMLERI),
  makbuz_no: z.string().optional().nullable(),
  aciklama: z.string().optional().nullable()
})

// Aidat satırı düzenleme (tutar + son ödeme tarihi). proje_id'yi şemada tutuyoruz
// ki validate body'den strip ETMESİN — frontend interceptor'ı PUT body'sine
// proje_id enjekte ediyor, controller extractProjeId body'den okuyor. En az bir
// düzenlenebilir alan (tutar veya son_odeme_tarihi) zorunlu.
export const updateAidatRowSchema = z
  .object({
    tutar: z.number().positive('Tutar pozitif olmalı').optional(),
    son_odeme_tarihi: z.string().optional(),
    proje_id: z.string().uuid().optional(),
    projeId: z.string().uuid().optional(),
  })
  .refine((d) => d.tutar !== undefined || d.son_odeme_tarihi !== undefined, {
    message: 'Düzenlenecek en az bir alan (tutar veya son ödeme tarihi) gerekli',
  })

export const aidatQuerySchema = z.object({
  proje_id: z.string().uuid().optional(),
  uye_id: z.string().uuid().optional(),
  yil: z.string().optional(),
  ay: z.string().optional(),
  durum: z.enum(AIDAT_DURUMLARI).optional(),
  page: z.string().optional(),
  limit: z.string().optional()
})
