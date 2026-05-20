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

  /**
   * Davet — proje-bazlı yeni akış (PR-D, 2026-05-20).
   *
   * Sprint role-system-modernization (PR-D):
   *   - Payload artık tek proje + tek projectRole ile sınırlı.
   *     { email, projeId, projectRole: 'manager' | 'user' }
   *   - Owner ataması bu akışla yapılamaz (her projede tek owner; controller
   *     schema'sı 'owner' değerini reddediyor).
   *   - Global rol ataması yok. trg_default_user_role trigger'ı varsa eski
   *     `user_roles.staff` insert'i hâlâ olabilir; bu PR'da o davranış
   *     değişmiyor (PR-E veya legacy cleanup ile temizlenir).
   *
   * Davet zaten varolan bir kullanıcıyı çağırırsa Supabase
   * `inviteUserByEmail` 'User already registered' hatası döner. Bu durumda
   * service mevcut user'ı id ile bulup proje üyeliğini upsert eder
   * (idempotent davet — kullanıcı zaten kayıtlıysa yeni magic-link
   * göndermek yerine sadece üyelik atanır).
   */
  async inviteUser(body: { email: string; projeId: string; projectRole: 'manager' | 'user' }) {
    const redirectTo = APP_PUBLIC_URL ? `${APP_PUBLIC_URL.replace(/\/$/, '')}/sifre-belirle` : undefined

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      body.email,
      redirectTo ? { redirectTo } : undefined,
    )

    let userId: string | null = null
    let invited = true

    if (error) {
      // 'User already registered' veya benzeri — mevcut kullanıcıyı id ile bul
      const message = (error.message ?? '').toLowerCase()
      if (
        message.includes('already') ||
        message.includes('registered') ||
        message.includes('exists')
      ) {
        const { data: existing, error: lookupErr } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 1000,
        })
        if (lookupErr) {
          logger.error('[ADMIN] invite fallback listUsers failed', { err: lookupErr, email: body.email })
          throw ApiError.internal('Davet sırasında kullanıcı aramada hata')
        }
        const found = existing?.users?.find((u) => u.email?.toLowerCase() === body.email.toLowerCase())
        if (!found) {
          logger.error('[ADMIN] inviteUserByEmail error (no fallback match)', { err: error, email: body.email })
          throw ApiError.badRequest(`Davet gönderilemedi: ${error.message}`)
        }
        userId = found.id
        invited = false
      } else {
        logger.error('[ADMIN] inviteUserByEmail error', { err: error, email: body.email })
        throw ApiError.badRequest(`Davet gönderilemedi: ${error.message}`)
      }
    } else {
      if (!data?.user) {
        throw ApiError.internal('Supabase davet sonrası user objesi dönmedi')
      }
      userId = data.user.id
    }

    if (!userId) {
      throw ApiError.internal('Davet sonrası user id bulunamadı')
    }

    // Proje üyeliğini upsert et (manager veya user)
    const { error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert(
        { user_id: userId, proje_id: body.projeId, rol: body.projectRole },
        { onConflict: 'user_id,proje_id' },
      )
    if (memErr) {
      logger.error('[ADMIN] proje_uyelikleri upsert failed', {
        err: memErr,
        userId,
        projeId: body.projeId,
        rol: body.projectRole,
      })
      throw ApiError.internal('Proje üyeliği oluşturulamadı')
    }
    clearProjectAccessCache(userId, body.projeId)

    logger.info(
      `[ADMIN] User invited: ${body.email} (${userId}) → proje=${body.projeId}, rol=${body.projectRole}, newMagicLink=${invited}`,
    )
    return {
      id: userId,
      email: body.email,
      proje_id: body.projeId,
      project_role: body.projectRole,
      invited,
    }
  },

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
