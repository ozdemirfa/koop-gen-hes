/**
 * Para birimi formatlama (TL)
 * @param value Sayısal değer
 * @returns 1.234,56 formatında string
 */
export const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '0,00'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Sayı formatlama
 * @param value Sayısal değer
 * @param decimals Ondalık basamak sayısı
 * @returns Formatlanmış string
 */
export const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
  const num = (value === null || value === undefined) ? 0 : value
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Ant Design InputNumber için formatter (TR locale)
 */
export const trNumberFormatter = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 20 }).format(num)
}

/**
 * Finansal değerler için formatter (2 ondalık basamak zorunlu)
 */
export const trMoneyFormatter = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '0,00'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0,00'
  return new Intl.NumberFormat('tr-TR', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(num)
}

/**
 * Ant Design InputNumber için parser (TR locale)
 */
export const trNumberParser = (displayValue: string | undefined): string => {
  if (!displayValue) return ''
  return displayValue.replace(/\./g, '').replace(',', '.')
}

/**
 * IBAN formatlama (TRxx xxxx xxxx xxxx xxxx xxxx xx)
 * @param iban Ham IBAN stringi
 * @returns Gruplandırılmış IBAN stringi
 */
export const formatIBAN = (iban: string | null | undefined): string => {
  if (!iban) return ''
  
  // Önce TR'yi ve diğer karakterleri temizle, sadece karakterleri al
  let clean = iban.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  
  // Eğer TR ile başlamıyorsa ekle (ama kullanıcı TR girmeye çalışıyor olabilir)
  if (!clean.startsWith('TR')) {
    clean = 'TR' + clean
  }

  // Standart IBAN baskı formatı: TÜM dizi (TR + 24) baştan 4'erli gruplanır →
  // "TR12 3123 1231 2312 4455 1231 23". (Önceki sürüm TR'yi ayırıp "TR 1231 ..."
  // üretiyordu; bu hem JSDoc'a hem standart formata aykırıydı.)
  const full = clean.substring(0, 26) // TR + 24 hane
  const parts = full.match(/.{1,4}/g) || []
  return parts.join(' ').trim()
}

/**
 * IBAN girişini formatlar (Otomatik TR ekler ve boşluk koyar: 4 4 4 4 4 4 2)
 */
export const formatIBANInput = (value: string): string => {
  // Boşlukları temizle, büyük harfe çevir
  const raw = value.replace(/\s+/g, '').toUpperCase()
  if (raw === '') return ''

  // TR ön ekini ayır; sonrasını sadece rakam yap (Türkiye IBAN: TR + 24 rakam)
  let digits: string
  if (raw.startsWith('TR')) {
    digits = raw.slice(2).replace(/\D/g, '')
  } else {
    // TR yok: tüm harfleri at, sadece rakam tut
    digits = raw.replace(/\D/g, '')
  }

  // Sadece "T" girildiyse veya rakam yoksa "TR" göster
  if (digits.length === 0) return 'TR'

  // Maks 24 rakam → toplam 26 karakter (TR + 24)
  const val = 'TR' + digits.substring(0, 24)

  // 4'erli grupla
  const parts = val.match(/.{1,4}/g) || []
  return parts.join(' ').trim()
}

/**
 * IBAN'ı saf rakam olarak döner (TR ve boşluklar hariç)
 */
export const getIBANRaw = (iban: string | null | undefined): string => {
  if (!iban) return ''
  // Sadece rakamları al
  return iban.replace(/[^0-9]/g, '')
}

/**
 * Telefon formatlama (xxx xxx xx xx)
 */
export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '').substring(0, 10)
  if (clean.length === 0) return ''
  
  let formatted = clean.substring(0, 3)
  if (clean.length > 3) {
    formatted += ' ' + clean.substring(3, 6)
    if (clean.length > 6) {
      formatted += ' ' + clean.substring(6, 8)
      if (clean.length > 8) {
        formatted += ' ' + clean.substring(8, 10)
      }
    }
  }
  return formatted
}

/**
 * Telefonu saf rakam olarak döner
 */
export const getPhoneRaw = (phone: string | null | undefined): string => {
  if (!phone) return ''
  return phone.replace(/\D/g, '').substring(0, 10)
}
