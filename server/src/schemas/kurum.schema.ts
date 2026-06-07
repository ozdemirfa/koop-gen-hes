import { z } from 'zod'
import { TUTAR_UPPER_BOUND } from './cariHesap.schema'

// Kurum (kurumsal cari) master-data — owner-scoped (firma pattern'i).
// vergi_no dolu ise 10 hane (tüzel kişi) kabul edilir; boş geçilebilir.
const vergiNoSchema = z
  .string()
  .regex(/^\d{10}$/, 'Vergi No 10 haneli rakam olmalı')
  .optional()
  .nullable()
  .or(z.literal(''))

export const createKurumSchema = z.object({
  kurum_adi: z.string().min(1, 'Kurum adı zorunlu'),
  kurum_turu: z.string().optional().nullable(),
  vergi_no: vergiNoSchema,
  telefon: z.string().optional().nullable(),
  aciklama: z.string().optional().nullable(),
  aktif: z.boolean().optional(),
})

export const updateKurumSchema = createKurumSchema.partial()

// Kurum ödemesi: kurum_id (owner kurumu) + tutar + ödeme türü. Backend proje_id +
// kurum_id'den kurum cari hesabını çözer. proje_id şemada tanımlı olmalı; aksi halde
// validate({body}) strip eder → controller bulamaz (feedback: zod-strip-proje_id).
export const kurumPaymentSchema = z
  .object({
    proje_id: z.string().uuid('proje_id zorunludur'),
    kurum_id: z.string().uuid('kurum_id zorunludur'),
    tutar: z
      .number()
      .positive('Tutar pozitif olmalı')
      .max(TUTAR_UPPER_BOUND, `Tutar ${TUTAR_UPPER_BOUND.toLocaleString('tr-TR')} TL üzerinde olamaz`),
    odeme_turu: z.enum(['nakit', 'banka', 'kredi_karti']),
    tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD formatında olmalı'),
    banka_hesap_id: z.string().uuid().optional().nullable(),
    aciklama: z.string().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.odeme_turu === 'banka' && !data.banka_hesap_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['banka_hesap_id'],
        message: 'Banka ödemesi için banka_hesap_id zorunludur',
      })
    }
  })
