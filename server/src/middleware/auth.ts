import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import { getUserRole } from './roleCache'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || ''

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('[AUTH] SUPABASE_URL veya SUPABASE_ANON_KEY eksik (VITE_ prefixed versiyonları da kontrol edin)')
}

if (!supabaseJwtSecret) {
  logger.warn('[AUTH] SUPABASE_JWT_SECRET set degil — lokal JWT verify devre disi, fallback olarak supabase.auth.getUser kullanilacak (her request bir round-trip)')
}

export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>
> extends Request<P, ResBody, ReqBody, ReqQuery, Locals> {
  user?: {
    id: string
    email?: string
  }
}

// Sprint 20260511-open-backlog-sprint (SEC-013):
// Lokal JWT verify ile supabase.auth.getUser round-trip elimine edildi.
// SUPABASE_JWT_SECRET set ise jose ile HS256 dogrulanir (1-2ms).
// Set degilse fallback olarak getUser kullanilir (geri uyumlu).
const jwtSecretBytes = supabaseJwtSecret
  ? new TextEncoder().encode(supabaseJwtSecret)
  : null

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

/**
 * Lokal JWT verify (HS256 + Supabase JWT Secret).
 * Basarili olursa { id, email } doner; aksi takdirde null.
 * exception throw etmez — fallback yolunu acik tutar.
 */
export async function verifyJwtLocal(token: string): Promise<{ id: string; email?: string } | null> {
  if (!jwtSecretBytes) return null
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes, {
      algorithms: ['HS256'],
    })
    // Supabase JWT payload: { sub, email, role, aud, exp, iat }
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    const email = typeof payload.email === 'string' ? payload.email : undefined
    return { id: payload.sub, email }
  } catch (_err) {
    // signature mismatch, expired, malformed → null (fallback'e birakiyoruz)
    return null
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Bearer token gerekli'))
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    // 1. Once lokal verify dene (SUPABASE_JWT_SECRET set ise)
    let user: { id: string; email?: string } | null = await verifyJwtLocal(token)

    // 2. Lokal fail (veya secret yok) → fallback: supabase.auth.getUser
    if (!user) {
      const { data, error } = await authClient.auth.getUser(token)
      if (error || !data.user) {
        next(ApiError.unauthorized('Geçersiz veya süresi dolmuş token'))
        return
      }
      user = { id: data.user.id, email: data.user.email }
    }

    req.user = user
    try {
      req.userRole = await getUserRole(user.id)
    } catch (e) {
      logger.error('[AUTH] role lookup failed', { err: e, userId: user.id })
      req.userRole = null
    }
    next()
  } catch (err) {
    logger.error('[AUTH] Token doğrulama exception', { err, method: req.method, path: req.path })
    next(ApiError.unauthorized('Token doğrulama hatası'))
  }
}
