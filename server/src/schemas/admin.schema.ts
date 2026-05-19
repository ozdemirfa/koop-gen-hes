import { z } from 'zod'

const projectAssignmentSchema = z.object({
  proje_id: z.string().uuid('Geçerli bir proje ID gereklidir'),
  rol: z.enum(['admin', 'staff', 'viewer'], {
    message: 'rol değeri admin/staff/viewer olmalıdır',
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

// Per-project membership
export const upsertProjeUyeligiSchema = z.object({
  user_id: z.string().uuid('Geçerli bir kullanıcı ID gereklidir'),
  rol: z.enum(['admin', 'staff', 'viewer']).default('staff'),
})

export const updateProjeUyeligiRoluSchema = z.object({
  rol: z.enum(['admin', 'staff', 'viewer']),
})
