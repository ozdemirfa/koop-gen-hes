import { z } from 'zod'
import { FIRMA_TIPLERI } from '../config/constants'

// C1 (sprint 20260511-uye-tahsilat-firma-revisions): vergi_no boş kabul edilir
// ama dolu ise tam 10 hane rakam olmalı (TR kurumlar vergi numarası format).
const vergiNoSchema = z
  .string()
  .regex(/^\d{10}$/, 'Vergi No 10 haneli rakam olmalı')
  .optional()
  .nullable()
  .or(z.literal(''))

export const createFirmaSchema = z.object({
  firma_tipi: z.enum(FIRMA_TIPLERI),
  unvan: z.string().min(1, 'Ünvan zorunlu'),
  vergi_no: vergiNoSchema,
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
