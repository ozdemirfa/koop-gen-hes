import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

/**
 * In-memory cache for (user_id, proje_id) → per-project role lookups.
 *
 * Sprint role-system-modernization (PR-B): yeni rol modeli
 *   - 'owner'    — proje sahibi (her projede 1 kişi)
 *   - 'manager'  — yıkıcı işlemler + parametre yönetimi
 *   - 'user'     — veri girişi + okuma
 *
 * Legacy rol değerleri ('admin' / 'staff' / 'viewer') backfill sonrası tabloda
 * kalmıyor olmalı (PR-A migration tümünü migrate etti). Yine de tip union'ı
 * geriye uyumluluk için korur — eski cache entry'ler ve test fixture'lar için.
 * Faz 3'te (PR-D sonrası) bu legacy değerler tip union'ından çıkarılacak.
 *
 * TTL 5dk — rol değişikliği sonrası admin tarafı `clearProjectAccessCache(userId)`
 * çağırmak zorunda; aksi halde rol değişikliği gecikmeli görünür.
 *
 * Multi-instance senaryosunda her instance ayrı cache tutar. Render
 * single-instance varsayımıyla uyumlu.
 */

export type NewProjectRole = 'owner' | 'manager' | 'user'
export type LegacyProjectRole = 'admin' | 'staff' | 'viewer'
export type ProjectRole = NewProjectRole | LegacyProjectRole

interface CacheEntry {
  role: ProjectRole | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000

const cacheKey = (userId: string, projeId: string) => `${userId}:${projeId}`

/**
 * Eski rol değerini yeni rol modeline normalize eder. Eski kayıtlar
 * (`'staff'` / `'viewer'` / eski `'admin'`) migration sonrasında tabloda
 * kalmaması gereken durumlar; bu fonksiyon defensive programming için
 * runtime'da da normalleştirir.
 *
 * Eşleştirme (PR-A backfill mantığı ile uyumlu):
 *   admin  → owner   (eski admin = global admin değil, proje admin'i)
 *   staff  → manager
 *   viewer → user
 */
export function normalizeProjectRole(role: ProjectRole | null): NewProjectRole | null {
  if (role === null) return null
  switch (role) {
    case 'owner':
    case 'manager':
    case 'user':
      return role
    case 'admin':
      return 'owner'
    case 'staff':
      return 'manager'
    case 'viewer':
      return 'user'
    default:
      return null
  }
}

/**
 * Hiyerarşik sıralama: owner > manager > user.
 * Daha yüksek rol her zaman daha düşük rolün yetkilerini kapsar.
 */
export const ROLE_RANK: Record<NewProjectRole, number> = {
  owner: 3,
  manager: 2,
  user: 1,
}

/**
 * `actual` rolü `required` rolünü karşılıyor mu? (hiyerarşik)
 */
export function roleSatisfies(actual: NewProjectRole | null, required: NewProjectRole): boolean {
  if (!actual) return false
  return ROLE_RANK[actual] >= ROLE_RANK[required]
}

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
