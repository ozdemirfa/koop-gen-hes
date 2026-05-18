import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

/**
 * In-memory cache for (user_id, proje_id) → per-project role lookups.
 *
 * Bu cache `proje_uyelikleri` tablosundaki kullanıcı-proje üyelik rolünü
 * (viewer/staff/admin) tutar. `requireProjectAccess` middleware'i bu cache'i
 * tüketir. TTL 5dk — promote/demote durumunda admin tarafı
 * `clearProjectAccessCache(userId)` çağırmak zorunda; aksi halde rol değişikliği
 * gecikmeli görünür.
 *
 * Multi-instance senaryosunda her instance ayrı cache tutar. Render
 * single-instance varsayımıyla uyumlu.
 */

export type ProjectRole = 'admin' | 'staff' | 'viewer'

interface CacheEntry {
  role: ProjectRole | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000

const cacheKey = (userId: string, projeId: string) => `${userId}:${projeId}`

export async function getProjectRole(userId: string, projeId: string): Promise<ProjectRole | null> {
  const now = Date.now()
  const key = cacheKey(userId, projeId)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.role
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('user_id', userId)
      .eq('proje_id', projeId)
      .maybeSingle()

    if (error) {
      logger.error('[PROJECT_ACCESS] membership lookup db error', {
        userId,
        projeId,
        code: error.code,
        message: error.message,
      })
      return null
    }

    const role = (data?.rol ?? null) as ProjectRole | null
    cache.set(key, { role, expiresAt: now + TTL_MS })
    return role
  } catch (err) {
    logger.error('[PROJECT_ACCESS] membership lookup exception', { userId, projeId, err })
    return null
  }
}

/**
 * userId verilirse o kullanıcının tüm proje üyelik cache'ini temizler.
 * Hiçbir parametre verilmezse tüm cache silinir (test reset / global invalidation).
 */
export function clearProjectAccessCache(userId?: string, projeId?: string): void {
  if (userId && projeId) {
    cache.delete(cacheKey(userId, projeId))
    return
  }
  if (userId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        cache.delete(key)
      }
    }
    return
  }
  cache.clear()
}
