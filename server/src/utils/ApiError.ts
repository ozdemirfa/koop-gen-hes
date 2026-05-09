export class ApiError extends Error {
  statusCode: number
  details?: any

  constructor(statusCode: number, message: string, details?: any) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  static badRequest(message: string, details?: any) {
    return new ApiError(400, message, details)
  }

  static notFound(message = 'Kayıt bulunamadı') {
    return new ApiError(404, message)
  }

  static unauthorized(message = 'Yetkilendirme gerekli') {
    return new ApiError(401, message)
  }

  static forbidden(message = 'Bu işlem için yetkiniz yok') {
    return new ApiError(403, message)
  }

  static conflict(message: string) {
    return new ApiError(409, message)
  }

  static internal(message = 'Sunucu hatası') {
    return new ApiError(500, message)
  }
}
