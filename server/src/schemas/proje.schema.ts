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
  blok_sayisi: z.number().int().min(0).optional(),
  daire_sayisi_per_blok: z.number().int().min(0).optional(),
  daire_kodlama_sistemi: z.string().optional().nullable()
})

export const updateProjeSchema = projeSchema.partial()

export const projeIsKalemiSchema = z.object({
  ust_kalem_id: z.string().uuid().optional().nullable(),
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
  yil: z.number().int().min(2020).max(2100),
  toplam_butce: z.number().min(0).optional(),
  aciklama: z.string().optional().nullable()
})

export const yillikPlanKalemiSchema = z.object({
  planlanan_tutar: z.number().min(0).optional(),
  gerceklesen_tutar: z.number().min(0).optional()
})
