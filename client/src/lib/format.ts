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
  if (value === null || value === undefined) return '0'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Ant Design InputNumber için formatter (TR locale)
 */
export const trNumberFormatter = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('tr-TR').format(num)
}

/**
 * Ant Design InputNumber için parser (TR locale)
 */
export const trNumberParser = (displayValue: string | undefined): string => {
  if (!displayValue) return ''
  return displayValue.replace(/\./g, '').replace(',', '.')
}
