import { z } from 'zod'

export const birimSchema = z.object({
  ad: z.string().min(1, 'Birim adı zorunlu')
})

export const pozSchema = z.object({
  poz_no: z.string().min(1, 'Poz no zorunlu'),
  tanim: z.string().min(1, 'Tanım zorunlu'),
  birim_id: z.string().uuid().optional().nullable()
})
