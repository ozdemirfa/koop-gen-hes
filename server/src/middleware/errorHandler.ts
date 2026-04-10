import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'
import { ZodError } from 'zod'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details && { details: err.details })
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validasyon hatası',
      details: err.issues.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message
      }))
    })
    return
  }

  // Supabase hataları genelde message içerir
  if ('code' in err && typeof (err as any).code === 'string') {
    const supaErr = err as any
    const statusCode = supaErr.code === '23505' ? 409
      : supaErr.code === '23503' ? 400
      : 500

    res.status(statusCode).json({
      success: false,
      error: supaErr.message || 'Veritabanı hatası',
      details: supaErr.details || undefined
    })
    return
  }

  console.error('Beklenmeyen hata:', err)
  res.status(500).json({
    success: false,
    error: 'Sunucu hatası'
  })
}
