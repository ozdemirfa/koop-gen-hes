import { z } from 'zod'

// Sprint yonetim-ekibi (2026-05-30):
// Yönetim ekibi (management team) CRUD + ödeme şemaları.
//
// NOT (memory feedback_zod_strip_proje_id): validate({body}) bilinmeyen alanları
// strip eder ve api.ts interceptor proje_id'yi gövdeye enjekte eder → proje_id
// şemada BULUNMALI, yoksa controller proje_id'yi bulamaz (400). Zod 4: z.uuid().

export const yonetimEkibiCreateSchema = z.object({
  proje_id: z.uuid('Geçerli proje_id gereklidir'),
  ad_soyad: z.string().min(1, 'Ad soyad zorunlu').max(255),
  oran: z.number().int('Oran tam sayı olmalı').min(0, 'Oran 0-100 arası olmalı').max(100, 'Oran 0-100 arası olmalı'),
})

export const yonetimEkibiUpdateSchema = z.object({
  // proje_id interceptor tarafından enjekte edilir; service update öncesi strip eder.
  proje_id: z.uuid().optional(),
  ad_soyad: z.string().min(1, 'Ad soyad zorunlu').max(255).optional(),
  oran: z.number().int('Oran tam sayı olmalı').min(0).max(100).optional(),
})

// Yönetim carisine ödeme. islem_turu yalnız gelen/giden ödeme (kullanıcı kuralı);
// gider/gelir olarak kaydedilmez — alacak'a işlenir + kasa/banka etkilenir.
export const yonetimPaymentSchema = z
  .object({
    proje_id: z.uuid('Geçerli proje_id gereklidir'),
    yonetim_id: z.uuid('Geçerli yonetim_id gereklidir'),
    islem_turu: z.enum(['gelen_odeme', 'giden_odeme']),
    odeme_turu: z.enum(['nakit', 'banka']),
    banka_hesap_id: z.uuid().optional().nullable(),
    tutar: z.number().positive('Tutar pozitif olmalı'),
    tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD formatında olmalı'),
    aciklama: z.string().max(1000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.odeme_turu === 'banka' && !val.banka_hesap_id) {
      ctx.addIssue({ code: 'custom', path: ['banka_hesap_id'], message: 'Banka ödemesi için banka hesabı zorunlu' })
    }
  })

export type YonetimEkibiCreateBody = z.infer<typeof yonetimEkibiCreateSchema>
export type YonetimEkibiUpdateBody = z.infer<typeof yonetimEkibiUpdateSchema>
export type YonetimPaymentBody = z.infer<typeof yonetimPaymentSchema>
