import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import { getUserRole } from './roleCache'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || ''

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('[AUTH] SUPABASE_URL veya SUPABASE_ANON_KEY eksik (VITE_ prefixed versiyonları da kontrol edin)')
}

if (!supabaseJwtSecret && !supabaseUrl) {
  logger.warn('[AUTH] Ne SUPABASE_JWT_SECRET ne de SUPABASE_URL var — lokal JWT verify devre disi, fallback supabase.auth.getUser (her request bir round-trip)')
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

// Sprint 20260511-open-backlog-sprint (SEC-013) + JWKS hibrit guncellemesi:
// Lokal JWT verify ile supabase.auth.getUser round-trip elimine edildi.
// 1. SUPABASE_JWT_SECRET set ise jose HS256 ile dogrular (legacy + test path, 1-2ms).
// 2. Aksi takdirde SUPABASE_URL'den JWKS endpoint'i fetch eder ve ES256/RS256
//    asymmetric signature ile dogrular (modern Supabase projeler, ilk request 5-10ms
//    sonrasi cache'li ~1-2ms). Supabase 2024 sonrasi yeni projeler default asymmetric.
// 3. Hicbiri yoksa fallback olarak supabase.auth.getUser kullanilir.
const jwtSecretBytes = supabaseJwtSecret
  ? new TextEncoder().encode(supabaseJwtSecret)
  : null

// Supabase JWKS endpoint — asymmetric key rotation otomatik handle edilir.
const jwks = supabaseUrl
  ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
  : null

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

/**
 * Lokal JWT verify — hibrit (HS256 legacy + ES256/RS256 JWKS modern).
 * Basarili olursa { id, email } doner; aksi takdirde null.
 * exception throw etmez — fallback yolunu acik tutar.
 */
export async function verifyJwtLocal(token: string): Promise<{ id: string; email?: string } | null> {
  // 1. HS256 legacy path (SUPABASE_JWT_SECRET set ise + test ortami)
  if (jwtSecretBytes) {
    try {
      const { payload } = await jwtVerify(token, jwtSecretBytes, {
        algorithms: ['HS256'],
      })
      if (typeof payload.sub === 'string' && payload.sub) {
        const email = typeof payload.email === 'string' ? payload.email : undefined
        return { id: payload.sub, email }
      }
    } catch (_err) {
      // HS256 imzasi tutmuyor — JWKS yoluna dus
    }
  }

  // 2. JWKS asymmetric path (modern Supabase, ES256/RS256)
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['ES256', 'RS256'],
      })
      if (typeof payload.sub === 'string' && payload.sub) {
        const email = typeof payload.email === 'string' ? payload.email : undefined
        return { id: payload.sub, email }
      }
    } catch (_err) {
      // JWKS de fail — supabase.auth.getUser fallback'ine birakilir
    }
  }

  return null
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
