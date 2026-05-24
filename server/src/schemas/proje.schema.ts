import { z } from 'zod'
import { IS_KALEMI_DURUMLARI } from '../config/constants'

export const projeSchema = z.object({
  proje_adi: z.string().min(1, 'Proje adı zorunlu'),
  aciklama: z.string().optional().nullable(),
  baslangic_tarihi: z.string().optional().nullable(),
  bitis_tarihi: z.string().optional().nullable(),
  toplam_butce: z.number().min(0).optional(),
  aktif: z.boolean().optional(),
  durum: z.enum(IS_KALEMI_DURUMLARI).optional(),
  bloklar: z.array(z.object({
    id: z.string().uuid().optional(),
    blok_adi: z.string().min(1, 'Blok adı zorunlu'),
    toplam_daire: z.number().int().min(1, 'Daire sayısı en az 1 olmalı'),
    daire_baslangic_no: z.number().int().min(0).optional(),
    aciklama: z.string().optional().nullable()
  })).optional()
})

export const updateProjeSchema = projeSchema.partial()

export const projeIsKalemiSchema = z.object({
  proje_id: z.string().uuid().optional(),
  sira_no: z.number().int().optional(),
  kalem_kodu: z.string().optional().nullable(),
  tanim: z.string().min(1, 'Tanım zorunlu'),
  birim: z.string().optional().nullable(),
  miktar: z.number().optional().nullable(),
  birim_fiyat: z.number().optional().nullable(),
  butce_tutari: z.number().min(0).optional(),
  durum: z.enum(IS_KALEMI_DURUMLARI).optional(),
  notlar: z.string().optional().nullable()
})

export const yillikPlanSchema = z.object({
  proje_id: z.string().uuid().optional(),
  yil: z.number().int().min(2020).max(2100).optional(),
  toplam_butce: z.number().min(0).optional(),
  aciklama: z.string().optional().nullable()
})

export const yillikPlanKalemiSchema = z.object({
  planlanan_tutar: z.number().min(0).optional(),
  gerceklesen_tutar: z.number().min(0).optional(),
  planlanan_adet: z.number().min(0).nullable().optional(),
  planlanan_birim_fiyat: z.number().min(0).nullable().optional(),
})

// Sprint proje-silme-akisi (2026-05-24): iki aşamalı silme akışı.
// Arşivleme (soft) için sebep zorunlu — audit trail'de "neden silindi"
// sorusuna cevap. min 3 karakter, max 500.
export const arsivleProjeSchema = z.object({
  sebep: z.string().min(3, 'Sebep en az 3 karakter olmalı').max(500, 'Sebep en fazla 500 karakter olabilir'),
})

// Kalıcı silme için proje adı yazma onayı (typo guard). Backend ayrıca
// DB'deki proje_adi ile EŞİT mi kontrol eder; case-sensitive eşleşme istenir.
export const kaliciSilProjeSchema = z.object({
  projeAdiOnay: z.string().min(1, 'Proje adı onayı zorunlu'),
})
