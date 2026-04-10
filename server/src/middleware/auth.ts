import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { ApiError } from '../utils/ApiError'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[AUTH] SUPABASE_URL veya SUPABASE_ANON_KEY eksik!')
}

console.log(`[AUTH] Middleware init - URL: ${supabaseUrl?.substring(0, 30)}...`)

export interface AuthRequest extends Request {
  user?: {
    id: string
    email?: string
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[AUTH] Token yok - ${req.method} ${req.path}`)
    next(ApiError.unauthorized('Bearer token gerekli'))
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error } = await supabase.auth.getUser()

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
