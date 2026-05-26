import { z } from 'zod'

export const createSozlesmeSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
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

// proje_id alanı IDOR fix (PR #136) sonrası controller tarafından
// extractProjeId(req) ile okunuyor; Zod default `.strip()` mode'unda olduğu için
// schema'da tanımlanmazsa validate middleware body'den proje_id'yi siler ve
// controller "proje_id zorunludur" 400 üretir (POST/PUT
// /sozlesmeler/:id/is-kalemleri için reprodüksiyon: 2026-05-26).
// Optional UUID olarak tanımlayıp pass-through ediyoruz; service tarafı zaten
// requireProjeId() ile non-empty doğrulayıp .eq('proje_id') ile cross-check
// yapar.
export const isKalemiSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir').optional(),
  poz_no: z.string().optional().nullable(),
  tanim: z.string().min(1, 'Tanım zorunlu'),
  birim: z.string().min(1, 'Birim zorunlu'),
  miktar: z.number().positive('Miktar pozitif olmalı'),
  birim_fiyat: z.number().min(0, 'Birim fiyat negatif olamaz'),
  sira_no: z.number().int().optional()
})
