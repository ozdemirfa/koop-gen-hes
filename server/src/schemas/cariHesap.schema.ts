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

// REV-PAY-03 (2026-05-12):
// uyelik_baslangic semantiği hibrit hale getirildi (TASK-BE-04 tasarımı revize edildi):
//   * odeme_turu='cari'                       → TAHAKKUK (banka hareketi yok, cari'de alacak)
//   * odeme_turu IN ('banka','nakit','kredi_karti','cek')  → TAHSİLAT (cari'de borc + banka/çek hareketi)
// Tahakkuk girişi artık Üye Detay'daki "Başlangıç Bedeli Tahakkuk Et" modal'ından
// (odeme_turu='cari' ile) yapılır; OdemeKayit sayfasında banka seçimi de mümkündür.
// Eski yasak kuralları (banka_hesap_id/cek_id/vade_tarihi/banka/sube/odeme_turu) kaldırıldı.
//
// iade_odeme hâlâ 'cari' kabul etmez (gerçek para çıkışı zorunlu).
// Çek için vade_tarihi zorunluluğu korunur.
// tutar 1 milyar TL üst sınırı korunur.
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
  // 2026-05-15 hotfix: Frontend "Teminat İadesi" checkbox sinyali. Backend bu boolean'ı
  // kaynak_tipi='teminat' string'ine map'liyor (cariHesap.service.ts:_createPaymentNormal).
  // Bu yaklaşım TASK-BE-08 SEC-014 mass-assignment koruması ile uyumlu:
  // kaynak_tipi/kaynak_id alanları client'tan ham olarak kabul edilmez; sadece bilinen
  // bir boolean sinyali whitelist'lenmiş bir enum değerine çevrilir.
  // Önceki bug: client `kaynak_tipi: 'teminat'` gönderiyordu ama Zod schema'da tanımlı
  // olmadığı için strip ediliyor, DB'ye NULL ulaşıyor, trigger ateşlenmiyordu.
  is_teminat: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // iade_odeme gerçek bir para hareketi olmalı — kasa/banka/çek/kart geçer, 'cari' değil
  if (data.islem_turu === 'iade_odeme' && data.odeme_turu === 'cari') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['odeme_turu'],
      message: "iade_odeme için odeme_turu 'cari' olamaz — gerçek bir para çıkışı (banka/nakit/çek/kredi_karti) zorunlu",
    })
  }

  // Çek ödemesi için vade_tarihi zorunlu — server-default vade tarihi finansal kaydı bozar
  if (data.odeme_turu === 'cek' && !data.vade_tarihi) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vade_tarihi'],
      message: 'Çek ödemesi için vade_tarihi zorunludur',
    })
  }

  // Banka ödemesinde banka_hesap_id zorunlu (defense-in-depth — frontend de Form rule koyuyor)
  if (data.odeme_turu === 'banka' && !data.banka_hesap_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['banka_hesap_id'],
      message: 'Banka ödemesi için banka_hesap_id zorunludur',
    })
  }
})
