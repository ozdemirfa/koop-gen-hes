import { z } from 'zod'
import { FIRMA_TIPLERI } from '../config/constants'

export const createFirmaSchema = z.object({
  firma_tipi: z.enum(FIRMA_TIPLERI),
  unvan: z.string().min(1, 'Ünvan zorunlu'),
  vergi_no: z.string().optional().nullable(),
  vergi_dairesi: z.string().optional().nullable(),
  telefon: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  adres: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  yetkili_kisi: z.string().optional().nullable(),
  notlar: z.string().optional().nullable(),
  aktif: z.boolean().optional()
})

export const updateFirmaSchema = createFirmaSchema.partial()
