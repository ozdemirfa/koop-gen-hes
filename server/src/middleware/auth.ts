import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'
import { getUserRole } from './roleCache'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('[AUTH] SUPABASE_URL veya SUPABASE_ANON_KEY eksik (VITE_ prefixed versiyonları da kontrol edin)')
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

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Bearer token gerekli'))
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await authClient.auth.getUser(token)

    if (error || !user) {
      next(ApiError.unauthorized('Geçersiz veya süresi dolmuş token'))
      return
    }

    req.user = { id: user.id, email: user.email }
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
