import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { clearRoleCache } from '../middleware/roleCache'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import logger from '../utils/logger'

// Sprint 20260520-perf hotfix: davet akışında frontend "Yok" seçimi null/undefined
// yolluyor. Service null'ı sessizce kabul eder (trigger 'staff' atar default).
// Sprint yetkili-role-system (PR-A, 2026-05-22): 'yetkili' eklendi.
export type GlobalRole = 'admin' | 'yetkili' | 'staff' | null | undefined
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
  /** PR-A: proje oluşturma hakkı = admin || yetkili */
  can_create_projects: boolean
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

    // PR-A: hiyerarşi admin (3) > yetkili (2) > staff (1).
    // Bir user için en yüksek role'u seç.
    const ROLE_RANK: Record<string, number> = { admin: 3, yetkili: 2, staff: 1 }
    const roleByUser = new Map<string, GlobalRole>()
    for (const r of roles ?? []) {
      const role = r.role as GlobalRole
      if (!role) continue
      const existing = roleByUser.get(r.user_id)
      if (!existing || (ROLE_RANK[role] ?? 0) > (ROLE_RANK[existing] ?? 0)) {
        roleByUser.set(r.user_id, role)
      }
    }

    const projeCountByUser = new Map<string, number>()
    for (const m of memberships ?? []) {
      projeCountByUser.set(m.user_id, (projeCountByUser.get(m.user_id) ?? 0) + 1)
    }

    return users.map((u) => {
      const role = roleByUser.get(u.id) ?? null
      return {
        id: u.id,
        email: u.email,
        global_role: role,
        proje_sayisi: projeCountByUser.get(u.id) ?? 0,
        son_giris: u.last_sign_in_at ?? null,
        created_at: u.created_at,
        can_create_projects: role === 'admin' || role === 'yetkili',
      }
    })
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
   * Sprint yetkili-role-system (PR-A, 2026-05-22):
   * Global rol atama / kaldırma. PR-D'deki `updateGlobalRole` 410'a düşürüldüğü
   * için yeni yetkili akışı bunu kullanır.
   *
   * Parametre:
   *   role = 'yetkili' → user_roles'a yetkili row upsert (varsa idempotent).
   *   role = 'staff'   → tüm yetkili row'ları sil, staff upsert.
   *   role = null      → user için tüm user_roles satırlarını sil (downgrade).
   *
   * 'admin' KABUL ETMEZ — admin promote yalnızca migration veya doğrudan DB
   * üzerinden yapılmalıdır (yanlışlıkla self-promote kapatma önlemi).
   *
   * Her çağrıda clearRoleCache(userId) ile in-memory cache invalidate edilir.
   * Audit logger.info ile yazılır (sistem_audit_log tablosu henüz yok).
   */
  async setUserGlobalRole(userId: string, role: 'yetkili' | 'staff' | null): Promise<void> {
    if ((role as unknown) === 'admin') {
      // Defensive: çağıran taraf yanlış kullansa bile reddet.
      throw ApiError.badRequest("admin rolü bu endpoint ile atanamaz")
    }

    try {
      if (role === null) {
        // Tüm global rolleri kaldır (admin row'lar dahil değil — admin row varsa
        // bu method ile düşürme yapılmaz; admin sadece direkt DB ile değişir).
        const { error } = await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .in('role', ['yetkili', 'staff'])
        if (error) {
          logger.error('[ADMIN] setUserGlobalRole revoke failed', { err: error, userId })
          throw ApiError.internal('Global rol kaldırılamadı')
        }
        clearRoleCache(userId)
        logger.info(`[ADMIN][audit] admin.role.revoked user=${userId}`)
        return
      }

      // Eski rolü hijyenik şekilde temizle (yetkili ↔ staff geçişleri için).
      // admin row varsa dokunma — admin downgrade bu endpoint kapsamında değil.
      const otherRole = role === 'yetkili' ? 'staff' : 'yetkili'
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', otherRole)

      const { error } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' })
      if (error) {
        logger.error('[ADMIN] setUserGlobalRole assign failed', { err: error, userId, role })
        throw ApiError.internal('Global rol atanamadı')
      }

      clearRoleCache(userId)
      logger.info(`[ADMIN][audit] admin.role.assigned user=${userId} role=${role}`)
    } catch (err) {
      if (err instanceof ApiError) throw err
      logger.error('[ADMIN] setUserGlobalRole exception', { err, userId, role })
      throw ApiError.internal('Global rol değiştirilemedi')
    }
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
