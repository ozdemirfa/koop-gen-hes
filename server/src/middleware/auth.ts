import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { ApiError } from '../utils/ApiError'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[AUTH] SUPABASE_URL veya SUPABASE_ANON_KEY eksik! (VITE_ prefixed versiyonlarını da kontrol edin)')
}

console.log(`[AUTH] Middleware init - URL: ${supabaseUrl?.substring(0, 30)}...`)

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
  file?: {
    buffer: Buffer
    originalname: string
    mimetype: string
    size: number
    fieldname: string
  }
  files?: any[] | { [fieldname: string]: any[] }
}

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[AUTH] Token yok - ${req.method} ${req.path}`)
    next(ApiError.unauthorized('Bearer token gerekli'))
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await authClient.auth.getUser(token)

    if (error || !user) {
      console.log(`[AUTH] getUser HATA - ${req.method} ${req.path}:`, error?.message || 'user null')
      next(ApiError.unauthorized('Geçersiz veya süresi dolmuş token'))
      return
    }

    console.log(`[AUTH] OK - ${user.email} - ${req.method} ${req.path}`)
    req.user = { id: user.id, email: user.email }
    next()
  } catch (err) {
    console.log(`[AUTH] CATCH hatası - ${req.method} ${req.path}:`, err)
    next(ApiError.unauthorized('Token doğrulama hatası'))
  }
}
