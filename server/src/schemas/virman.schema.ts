import { z } from 'zod'

// Sprint 20260520-virman-feature:
// Virman (transfer) create schema. virman_tipi'ye göre kaynak/hedef NULL kuralları:
//   banka_banka  → her ikisi UUID + birbirinden farklı
//   banka_nakit  → kaynak UUID, hedef null
//   nakit_banka  → kaynak null, hedef UUID
// DB CHECK constraint'leri aynı kuralları zorlar; bu schema erken hata için.

// PR fix/virman-defensive-proje-id: Zod 4'te `.string().uuid()` deprecated edildi;
// native `z.uuid()` ile değiştir → 4.x sonrası .superRefine ile zincirleme parse
// davranışındaki olası quirk'leri eler (proje_id 400 bug shortlist).
export const virmanCreateSchema = z
  .object({
    proje_id: z.uuid('Geçerli proje_id gereklidir'),
    virman_tipi: z.enum(['banka_banka', 'banka_nakit', 'nakit_banka']),
    kaynak_hesap_id: z.uuid().optional().nullable(),
    hedef_hesap_id: z.uuid().optional().nullable(),
    tutar: z.number().positive('Tutar pozitif olmalı'),
    tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD formatında olmalı'),
    aciklama: z.string().max(500).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.virman_tipi === 'banka_banka') {
      if (!val.kaynak_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['kaynak_hesap_id'], message: 'banka_banka için kaynak hesap zorunlu' })
      }
      if (!val.hedef_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['hedef_hesap_id'], message: 'banka_banka için hedef hesap zorunlu' })
      }
      if (val.kaynak_hesap_id && val.hedef_hesap_id && val.kaynak_hesap_id === val.hedef_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['hedef_hesap_id'], message: 'Kaynak ve hedef hesap aynı olamaz' })
      }
    } else if (val.virman_tipi === 'banka_nakit') {
      if (!val.kaynak_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['kaynak_hesap_id'], message: 'banka_nakit için kaynak hesap zorunlu' })
      }
      if (val.hedef_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['hedef_hesap_id'], message: 'banka_nakit için hedef hesap NULL olmalı' })
      }
    } else if (val.virman_tipi === 'nakit_banka') {
      if (val.kaynak_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['kaynak_hesap_id'], message: 'nakit_banka için kaynak hesap NULL olmalı' })
      }
      if (!val.hedef_hesap_id) {
        ctx.addIssue({ code: 'custom', path: ['hedef_hesap_id'], message: 'nakit_banka için hedef hesap zorunlu' })
      }
    }
  })

export type VirmanCreateBody = z.infer<typeof virmanCreateSchema>
