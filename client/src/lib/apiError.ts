// Backend errorHandler kontratı: { success: false, error: string, details?: ... }
// axios interceptor (lib/api.ts) success===false body'yi reject eder, AxiosError fallback olur.

export interface ApiErrorResponse {
  success: false
  error: string
  details?: unknown
}

export function getErrorMessage(err: unknown, fallback = 'Hata oluştu'): string {
  if (err && typeof err === 'object') {
    const e = err as Partial<ApiErrorResponse> & { message?: string }
    if (typeof e.error === 'string' && e.error) return e.error
    if (typeof e.message === 'string' && e.message) return e.message
  }
  return fallback
}
