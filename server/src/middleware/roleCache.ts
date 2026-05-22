import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

/**
 * In-memory cache for per-user role lookups.
 *
 * TTL: 60s — kabul edilebilir demote penceresi. Bir kullanıcı admin'den
 * çıkarıldıktan sonra eski role bilgisi en fazla bu süre boyunca cache'te
 * kalabilir.
 *
 * NOT: user_roles tablosu şu an admin UI üzerinden değil, doğrudan SQL
 * migration'ları ile güncelleniyor (örn. supabase/migrations/*_seed_*_user_role.sql).
 * Rol değişikliği yapan ileride bir admin endpoint'i `clearRoleCache(userId)`
 * çağırmalı; aksi takdirde demote sonrası 60s admin penceresi açık kalır.
 *
 * Eğer çoklu node deploy'a geçilirse (Render birden fazla instance) bu in-memory
 * cache instance başına ayrı çalışır — `clearRoleCache` tek bir instance'ı
 * temizler. Multi-instance senaryosu için Redis pub/sub veya kısa TTL kalmalı.
 */

// Sprint yetkili-role-system (PR-A, 2026-05-22):
//   user_roles.role CHECK constraint genişletildi: admin | yetkili | staff
//   Hiyerarşi: admin (rank 3) > yetkili (rank 2) > staff (rank 1)
export type AppRole = 'admin' | 'yetkili' | 'staff'

export const ROLE_RANK: Record<AppRole, number> = {
  admin: 3,
  yetkili: 2,
  staff: 1,
}

interface CacheEntry {
  role: AppRole | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 60 * 1000 // 1 minute — kabul edilebilir demote penceresi

export async function getUserRole(userId: string): Promise<AppRole | null> {
  const now = Date.now()
  const cached = cache.get(userId)
  if (cached && cached.expiresAt > now) {
    return cached.role
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)

    if (error) {
      logger.error('[RBAC] role lookup db error', {
        userId,
        code: error.code,
        message: error.message,
        details: error.details,
      })
      return null
    }

    const roles = (data ?? []).map((r: { role: string }) => r.role)
    // En yüksek role'u seç (admin > yetkili > staff)
    const role: AppRole | null = roles.includes('admin')
      ? 'admin'
      : roles.includes('yetkili')
      ? 'yetkili'
      : roles.includes('staff')
      ? 'staff'
      : null

    cache.set(userId, { role, expiresAt: now + TTL_MS })
    return role
  } catch (err) {
    logger.error('[RBAC] role lookup exception', { userId, err })
    return null
  }
}

export function clearRoleCache(userId?: string): void {
  if (userId) {
    cache.delete(userId)
  } else {
    cache.clear()
  }
}
