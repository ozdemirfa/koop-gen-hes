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

  // TR'den sonrasını 4-4-4-4-4-4-2 şeklinde grupla
  // IBAN TR dahil 26 hane (2 + 24)
  const prefix = clean.substring(0, 2) // TR
  const rest = clean.substring(2, 26) // Maksimum 24 hane rakam
  
  const parts = rest.match(/.{1,4}/g) || []
  return (prefix + ' ' + parts.join(' ')).trim()
}

/**
 * IBAN girişini formatlar (Otomatik TR ekler ve boşluk koyar: 4 4 4 4 4 4 2)
 */
export const formatIBANInput = (value: string): string => {
  // Sadece harf ve rakamları tut
  let val = value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  
  // Eğer TR ile başlamıyorsa ve bir şeyler girilmişse TR ekle
  if (val.length > 0 && !val.startsWith('TR')) {
    val = 'TR' + val
  }
  
  // Eğer sadece T veya TR girilmişse veya boşsa
  if (val === 'T') val = 'TR'
  
  // Maksimum 26 karakter (TR + 24 hane)
  val = val.substring(0, 26)
  
  // 4'erli grupla (Son grup 2 hane kalacak şekilde)
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
