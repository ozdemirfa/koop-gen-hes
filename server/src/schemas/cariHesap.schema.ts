import { z } from 'zod'
import { CARI_HAREKET_TIPLERI } from '../config/constants'

export const cariHareketSchema = z.object({
  proje_id: z.string().uuid().optional(),
  firma_id: z.string().uuid(),
  hareket_tipi: z.enum(CARI_HAREKET_TIPLERI),
  tutar: z.number().positive(),
  tarih: z.string().optional(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable()
})

export const cariPaymentSchema = z.object({
  proje_id: z.string().uuid(),
  cari_hesap_id: z.string().uuid(),
  islem_turu: z.enum(['gelen_odeme', 'giden_odeme']),
  odeme_turu: z.enum(['nakit', 'banka', 'cek', 'kredi_karti']),
  tutar: z.number().positive(),
  tarih: z.string(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable(),
  banka_hesap_id: z.string().uuid().optional().nullable(),
  cek_id: z.string().uuid().optional().nullable(),
  vade_tarihi: z.string().optional().nullable(),
  banka: z.string().optional().nullable(),
  sube: z.string().optional().nullable()
})
