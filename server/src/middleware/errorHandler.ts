import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'
import { ZodError } from 'zod'
import logger from '../utils/logger'

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

  // Supabase (PostgreSQL) hatalarını temizle ve kullanıcı dostu hale getir
  if ('code' in err && typeof (err as any).code === 'string') {
    const supaErr = err as any
    let statusCode = 500
    let userMessage = 'Veritabanı hatası oluştu'

    switch (supaErr.code) {
      case '23505':
        statusCode = 409
        userMessage = 'Bu kayıt zaten mevcut (mükerrer kayıt)'
        break
      case '23503':
        statusCode = 400
        userMessage = 'Bu kayıt başka verilerle ilişkili olduğu için işlem yapılamaz'
        break
      case '23502':
        statusCode = 400
        userMessage = 'Eksik veri gönderildi'
        break
      case '42P01':
        // Tablo yok hatası gibi sistem detaylarını asla sızdırma
        userMessage = 'Sistem hatası (Veri yapısı uyuşmazlığı)'
        break
    }

    res.status(statusCode).json({
      success: false,
      error: userMessage
    })
    return
  }

  logger.error('Beklenmeyen hata', { err, stack: err.stack })
  res.status(500).json({
    success: false,
    error: 'Sunucu hatası'
  })
}
