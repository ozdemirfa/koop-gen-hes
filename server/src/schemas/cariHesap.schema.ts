import { z } from 'zod'
import { CARI_HAREKET_TIPLERI } from '../config/constants'

export const cariHareketSchema = z.object({
  firma_id: z.string().uuid(),
  hareket_tipi: z.enum(CARI_HAREKET_TIPLERI),
  tutar: z.number().positive(),
  tarih: z.string().optional(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable()
})
