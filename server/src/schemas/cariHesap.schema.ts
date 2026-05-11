import { z } from 'zod'
import { CARI_HAREKET_TIPLERI } from '../config/constants'

// TASK-BE-08 (sprint 20260511-backlog-batch3, SEC-014):
// proje_id artık zorunlu (multi-tenant izolasyon defense-in-depth) + .strict() mode
// extra field reddi (mass assignment koruması, örn. kaynak_tipi/kaynak_id manipülasyonu).
export const cariHareketSchema = z.object({
  proje_id: z.string().uuid('proje_id zorunludur'),
  firma_id: z.string().uuid(),
  hareket_tipi: z.enum(CARI_HAREKET_TIPLERI),
  tutar: z.number().positive(),
  tarih: z.string().optional(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable()
}).strict()

// TASK-BE-04 (sprint 20260511-backlog-batch1):
// Defense-in-depth for cari payment schema. uyelik_baslangic is a pure accrual,
// iade_odeme must hit a real money path, çek requires vade_tarihi at the schema
// level so server-side defaults can no longer mask a frontend bug. tutar has a
// 1 billion TRY upper bound to limit audit-log blast radius from a malicious
// or buggy client.
export const TUTAR_UPPER_BOUND = 1_000_000_000

export const cariPaymentSchema = z.object({
  proje_id: z.string().uuid(),
  cari_hesap_id: z.string().uuid(),
  islem_turu: z.enum(['gelen_odeme', 'giden_odeme', 'iade_odeme', 'uyelik_baslangic']),
  odeme_turu: z.enum(['nakit', 'banka', 'cek', 'kredi_karti', 'cari']),
  tutar: z
    .number()
    .positive()
    .max(TUTAR_UPPER_BOUND, `tutar ${TUTAR_UPPER_BOUND.toLocaleString('tr-TR')} TL üzerinde olamaz`),
  tarih: z.string(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable(),
  banka_hesap_id: z.string().uuid().optional().nullable(),
  cek_id: z.string().uuid().optional().nullable(),
  vade_tarihi: z.string().optional().nullable(),
  banka: z.string().optional().nullable(),
  sube: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // uyelik_baslangic sadece tahakkuk kaydı — banka/çek/vade alanları yasak
  if (data.islem_turu === 'uyelik_baslangic') {
    if (data.banka_hesap_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['banka_hesap_id'],
        message: 'uyelik_baslangic için banka_hesap_id gönderilemez',
      })
    }
    if (data.cek_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cek_id'],
        message: 'uyelik_baslangic için cek_id gönderilemez',
      })
    }
    if (data.vade_tarihi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vade_tarihi'],
        message: 'uyelik_baslangic için vade_tarihi gönderilemez',
      })
    }
    if (data.banka) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['banka'],
        message: 'uyelik_baslangic için banka adı alanı gönderilemez',
      })
    }
    if (data.sube) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sube'],
        message: 'uyelik_baslangic için şube alanı gönderilemez',
      })
    }
    if (data.odeme_turu === 'banka' || data.odeme_turu === 'cek') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odeme_turu'],
        message: "uyelik_baslangic için odeme_turu 'cari' veya 'nakit' olmalı (banka/cek değil)",
      })
    }
  }

  // iade_odeme gerçek bir para hareketi olmalı — kasa/banka/çek/kart geçer, 'cari' değil
  if (data.islem_turu === 'iade_odeme') {
    if (data.odeme_turu === 'cari') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odeme_turu'],
        message: "iade_odeme için odeme_turu 'cari' olamaz — gerçek bir para çıkışı (banka/nakit/çek/kredi_karti) zorunlu",
      })
    }
  }

  // Çek ödemesi için vade_tarihi zorunlu — server-default vade tarihi finansal kaydı bozar
  if (data.odeme_turu === 'cek' && !data.vade_tarihi) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vade_tarihi'],
      message: 'Çek ödemesi için vade_tarihi zorunludur',
    })
  }
})
