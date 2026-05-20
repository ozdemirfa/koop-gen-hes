import { z } from 'zod'

/**
 * Sprint role-system-modernization (PR-B):
 *   Yeni rol modeli: owner / manager / user.
 *   Davet ve atama akışları yeni model değerlerini kabul eder. Legacy
 *   admin/staff/viewer değerleri tip union'da geriye uyumluluk için tutulur
 *   (frontend henüz revize edilmediği sürece bozulmadan kabul edilirler;
 *   faz 3'te schema'dan çıkarılacaklar).
 */
export const PROJECT_ROLE_VALUES = ['owner', 'manager', 'user', 'admin', 'staff', 'viewer'] as const
export type ProjectRoleSchemaValue = (typeof PROJECT_ROLE_VALUES)[number]

const projectAssignmentSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  rol: z.enum(PROJECT_ROLE_VALUES, {
    message: 'rol değeri owner/manager/user olmalıdır (legacy: admin/staff/viewer)',
  }),
})

// Sprint 20260520-perf hotfix: frontend "Yok (sadece proje üyesi)" seçimi
// `globalRole: null` yolluyor → schema null'ı kabul etmeli. null/'none' →
// kullanıcının global rolü yok (sadece proje_uyelikleri'ne dayalı erişim).
export const inviteUserSchema = z.object({
  email: z.string().email('Geçerli bir e-posta gerekli'),
  globalRole: z.enum(['admin', 'staff']).nullable().optional(),
  projectAssignments: z.array(projectAssignmentSchema).default([]),
})

export const updateGlobalRoleSchema = z.object({
  role: z.enum(['admin', 'staff'], {
    message: 'role değeri admin veya staff olmalıdır',
  }),
})

// Per-project membership — PR-B sonrası default 'user'.
export const upsertProjeUyeligiSchema = z.object({
  user_id: z.string().uuid('Geçerli bir kullanıcı ID gereklidir'),
  rol: z.enum(PROJECT_ROLE_VALUES).default('user'),
})

export const updateProjeUyeligiRoluSchema = z.object({
  rol: z.enum(PROJECT_ROLE_VALUES),
})
