import { z } from 'zod'
import { UYELIK_DURUMLARI, CINSIYETLER } from '../config/constants'

// Boş string'i undefined'a çeviren helper
const optionalString = z.string().transform(v => v === '' ? undefined : v).pipe(z.string().optional()).or(z.undefined())

export const createUyeSchema = z.object({
  proje_id: z.string().uuid().optional(),
  uye_no: z.string().optional(),
  tc_kimlik: z.union([
    z.string().length(11, 'TC kimlik 11 haneli olmalı'),
    z.literal(''),
    z.null(),
    z.undefined()
  ]).transform(v => v === '' ? null : v).optional().nullable(),
  ad: z.string().min(1, 'Ad zorunlu'),
  soyad: z.string().min(1, 'Soyad zorunlu'),
  cinsiyet: z.enum(CINSIYETLER).optional().nullable(),
  telefon: z.union([z.string().min(1), z.literal(''), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  email: z.union([z.string().email('Geçersiz email'), z.literal(''), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  adres: z.union([z.string(), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  blok_id: z.union([z.string().uuid(), z.literal(''), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  daire_no: z.union([z.string(), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  serefiye_id: z.union([z.string().uuid(), z.literal(''), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable(),
  serefiye_orani: z.number().min(0).max(100).optional(),
  uyelik_tarihi: z.string().optional(),
  durum: z.enum(UYELIK_DURUMLARI).optional(),
  notlar: z.union([z.string(), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable()
})

export const updateUyeSchema = createUyeSchema.partial()

export const blokSchema = z.object({
  blok_adi: z.string().min(1, 'Blok adı zorunlu'),
  toplam_daire: z.number().int().min(1, 'Toplam daire en az 1 olmalı'),
  aciklama: z.union([z.string(), z.null(), z.undefined()]).transform(v => v === '' ? null : v).optional().nullable()
})
