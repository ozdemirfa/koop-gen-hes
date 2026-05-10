import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

export type AppRole = 'admin' | 'staff'

interface CacheEntry {
  role: AppRole | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 60 * 1000

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
    const role: AppRole | null = roles.includes('admin')
      ? 'admin'
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
