import { z } from 'zod'

/**
 * Sprint role-system-modernization (PR-D, 2026-05-20):
 *   Davet ve atama akışları artık proje-bazlı. Yeni payload:
 *     { email, projeId, projectRole: 'manager' | 'user' }
 *   Eski `globalRole` (admin/staff) ve çoklu `projectAssignments[]` yapısı
 *   kaldırıldı. Şifre yenileme akışı için ayrı schema eklendi.
 *
 *   Backward compatibility: NewProjectRole = 'owner' | 'manager' | 'user'.
 *   Owner atama akışları desteklenmez (her projede tek owner; transfer ayrı
 *   süreç). Legacy değerler (admin/staff/viewer) cache normalization katmanında
 *   tolere edilir ama yeni davet payload'ı yalnızca yeni model değerlerini
 *   kabul eder.
 */
export const NEW_PROJECT_ROLE_VALUES = ['owner', 'manager', 'user'] as const
export const PROJECT_ROLE_VALUES = ['owner', 'manager', 'user', 'admin', 'staff', 'viewer'] as const
export type ProjectRoleSchemaValue = (typeof PROJECT_ROLE_VALUES)[number]

// inviteUserSchema kaldırıldı (2026-05-21).
// Yeni davet schema'sı: server/src/schemas/invitation.schema.ts
//   POST /api/projeler/:projeId/invitations
//   Body: { email, projectRole: 'manager' | 'user' }

/**
 * @deprecated PR-D ile kaldırıldı; global rol artık davet payload'ında yok.
 * Schema dosyası bu export'u geriye uyumluluk için boş bir validator ile
 * yayımlamayı bırakıyor — controller bunu kullanmıyor.
 */
export const updateGlobalRoleSchema = z.object({
  role: z.enum(['admin', 'staff'], {
    message: 'role değeri admin veya staff olmalıdır',
  }),
})

/**
 * Şifre yenileme — owner-only. Body:
 *   - projeId: hangi projede üyelik kontrolü yapılacak
 *   - newPassword: opsiyonel (verilmezse 16 char random şifre üretilir)
 */
export const resetPasswordSchema = z.object({
  projeId: z.string().uuid('Geçerli bir proje ID gereklidir'),
  newPassword: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalı')
    .max(72, 'Şifre en fazla 72 karakter olabilir')
    .optional()
    .nullable()
    .transform((v) => (v === null ? undefined : v)),
})

// Per-project membership — PR-B sonrası default 'user'.
// PR-D'de proje üyelik upsert akışı `projectRole` enum'unu yeni model
// değerleriyle kısıtlar (legacy values upsert akışında reddedilir).
export const upsertProjeUyeligiSchema = z.object({
  user_id: z.string().uuid('Geçerli bir kullanıcı ID gereklidir'),
  rol: z.enum(NEW_PROJECT_ROLE_VALUES).default('user'),
})

export const updateProjeUyeligiRoluSchema = z.object({
  rol: z.enum(NEW_PROJECT_ROLE_VALUES, {
    message: 'rol değeri owner/manager/user olmalıdır',
  }),
})
