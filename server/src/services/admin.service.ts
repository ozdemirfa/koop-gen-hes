import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { clearRoleCache } from '../middleware/roleCache'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import logger from '../utils/logger'

// Sprint 20260520-perf hotfix: davet akışında frontend "Yok" seçimi null/undefined
// yolluyor. Service null'ı sessizce kabul eder (trigger 'staff' atar default).
export type GlobalRole = 'admin' | 'staff' | null | undefined
// Sprint role-system-modernization (PR-B): yeni model owner/manager/user.
// Legacy değerler tip union'da kalır (frontend henüz revize edilmedi).
export type ProjectRole = 'owner' | 'manager' | 'user' | 'admin' | 'staff' | 'viewer'

interface ProjectAssignment {
  proje_id: string
  rol: ProjectRole
}

interface AdminUserSummary {
  id: string
  email?: string
  global_role: GlobalRole | null
  proje_sayisi: number
  son_giris?: string | null
  created_at?: string
}

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || ''

export const adminService = {
  /**
   * Tüm auth.users kayıtlarını user_roles + proje_uyelikleri ile birleştirip
   * admin listesi döndürür.
   */
  async listUsers(): Promise<AdminUserSummary[]> {
    const { data: authResp, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 })
    if (authErr) {
      logger.error('[ADMIN] listUsers auth error', { err: authErr })
      throw ApiError.internal('Kullanıcı listesi alınamadı')
    }
    const users = authResp.users ?? []
    if (users.length === 0) return []

    const userIds = users.map((u) => u.id)

    const [{ data: roles }, { data: memberships }] = await Promise.all([
      supabaseAdmin.from('user_roles').select('user_id, role').in('user_id', userIds),
      supabaseAdmin.from('proje_uyelikleri').select('user_id, proje_id').in('user_id', userIds),
    ])

    const roleByUser = new Map<string, GlobalRole>()
    for (const r of roles ?? []) {
      const role = r.role as GlobalRole
      const existing = roleByUser.get(r.user_id)
      // admin > staff hiyerarşisi
      if (!existing || role === 'admin') roleByUser.set(r.user_id, role)
    }

    const projeCountByUser = new Map<string, number>()
    for (const m of memberships ?? []) {
      projeCountByUser.set(m.user_id, (projeCountByUser.get(m.user_id) ?? 0) + 1)
    }

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      global_role: roleByUser.get(u.id) ?? null,
      proje_sayisi: projeCountByUser.get(u.id) ?? 0,
      son_giris: u.last_sign_in_at ?? null,
      created_at: u.created_at,
    }))
  },

  // inviteUser kaldırıldı (davet akışı yeniden tasarımı, 2026-05-21).
  // Yeni davet akışı: server/src/services/invitation.service.ts
  // Frontend artık POST /api/projeler/:projeId/invitations'a çağrı atıyor.

  /**
   * Global rol değiştir (user_roles).
   * 'staff' demote: tüm admin row'lar silinir; ardından staff insert (idempotent).
   * 'admin' promote: admin upsert; staff row'u korunur (hierarchical).
   */
  async updateGlobalRole(userId: string, role: GlobalRole) {
    if (role === 'admin') {
      const { error } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' })
      if (error) {
        logger.error('[ADMIN] promote admin failed', { err: error, userId })
        throw ApiError.internal('Global rol güncellenemedi')
      }
    } else {
      // 'staff' demote — varolan admin row'larını sil; staff upsert ile garanti
      await supabaseAdmin.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin')
      const { error } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: userId, role: 'staff' }, { onConflict: 'user_id,role' })
      if (error) {
        logger.error('[ADMIN] demote staff failed', { err: error, userId })
        throw ApiError.internal('Global rol güncellenemedi')
      }
    }

    clearRoleCache(userId)
    logger.info(`[ADMIN] global role updated: ${userId} → ${role}`)
    return { id: userId, role }
  },

  /**
   * Kullanıcıyı sil — auth.users CASCADE ile user_roles + proje_uyelikleri'i temizler.
   */
  async deleteUser(userId: string) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      logger.error('[ADMIN] deleteUser failed', { err: error, userId })
      throw ApiError.badRequest(`Kullanıcı silinemedi: ${error.message}`)
    }
    clearRoleCache(userId)
    clearProjectAccessCache(userId)
    logger.info(`[ADMIN] user deleted: ${userId}`)
    return { id: userId, success: true }
  },
}
