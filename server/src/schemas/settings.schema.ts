import { z } from 'zod'

// Sprint birim-poz-user-scope (2026-05-27):
//   `is_global` flag — client tarafından gönderilir. true ise kullanici_id NULL
//   (global referans), false (veya yok) ise kullanici_id = req.user.id (kişisel).
//   Yetki kontrolü middleware (requireCreateGlobalDefs is_global=true için).

export const birimSchema = z.object({
  ad: z.string().min(1, 'Birim adı zorunlu'),
  is_global: z.boolean().optional().default(false),
})

export const pozSchema = z.object({
  poz_no: z.string().min(1, 'Poz no zorunlu'),
  tanim: z.string().min(1, 'Tanım zorunlu'),
  birim_id: z.string().uuid().optional().nullable(),
  is_global: z.boolean().optional().default(false),
})
