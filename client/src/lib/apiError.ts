// Backend errorHandler kontratı: { success: false, error: string, details?: ... }
// axios interceptor (lib/api.ts) success===false body'yi reject eder, AxiosError fallback olur.

export interface ApiErrorIssue {
  field: string
  message: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  details?: ApiErrorIssue[] | unknown
}

/**
 * Backend hatasından human-readable mesaj çıkar.
 *
 * U-12 (2026-05-11): Zod array details desteği. Backend `errorHandler` Zod ya da
 * PG hatalarında `details: [{ field, message }, ...]` döndürüyor. Bu fonksiyon
 * artık `details[0].message`'i de okuyabilir — eğer `error` çok generic ise
 * (örn. "Validasyon hatası") spesifik alan mesajını öne çıkartır.
 */
export function getErrorMessage(err: unknown, fallback = 'Hata oluştu'): string {
  if (err && typeof err === 'object') {
    const e = err as Partial<ApiErrorResponse> & {
      message?: string
      response?: { status?: number }
      status?: number
    }

    // 1. Backend details array varsa ve gerçek alan-bazlı mesaj içeriyorsa onu kullan
    if (Array.isArray(e.details) && e.details.length > 0) {
      const first = e.details[0] as Partial<ApiErrorIssue>
      // __debug field'ları skip et (dev-only PG raw output)
      const realIssue = (e.details as Partial<ApiErrorIssue>[]).find(
        (d) => d && typeof d.field === 'string' && d.field !== '__debug' && typeof d.message === 'string'
      )
      if (realIssue?.message) {
        // Generic backend mesajına spesifik alanı ekle: "Tutar: pozitif olmalı"
        if (typeof e.error === 'string' && /validasyon|geçersiz/i.test(e.error) && realIssue.field) {
          return `${realIssue.field}: ${realIssue.message}`
        }
        return realIssue.message
      }
      // Fallback to first issue even if field is __debug only (dev)
      if (first?.message) return first.message
    }

    if (typeof e.error === 'string' && e.error) {
      // Sprint 20260520-perf: 403 generic mesajları için friendly çeviri.
      const status = e.response?.status ?? e.status
      if (status === 403 || /forbidden|yetki|yasak/i.test(e.error)) {
        return 'Bu işlem için yetkiniz yok. Proje yöneticisiyle iletişime geçin.'
      }
      if (status === 401 || /unauthorized|bearer/i.test(e.error)) {
        return 'Oturumunuzun süresi dolmuş. Lütfen tekrar giriş yapın.'
      }
      return e.error
    }
    if (typeof e.message === 'string' && e.message) return e.message
  }
  return fallback
}

/**
 * Backend details array'ini AntD Form `setFields` formatına çevir.
 * Sadece gerçek field-level Zod/PG hatalarını döndürür, __debug skip edilir.
 *
 * Kullanım:
 *   try { await api.post(...) }
 *   catch (err) {
 *     form.setFields(toFormFields(err))
 *     message.error(getErrorMessage(err))
 *   }
 */
export function toFormFields(err: unknown): { name: string; errors: string[] }[] {
  if (!err || typeof err !== 'object') return []
  const e = err as Partial<ApiErrorResponse>
  if (!Array.isArray(e.details)) return []
  return (e.details as Partial<ApiErrorIssue>[])
    .filter((d) => d && typeof d.field === 'string' && d.field !== '__debug' && typeof d.message === 'string')
    .map((d) => ({ name: d.field as string, errors: [d.message as string] }))
}
