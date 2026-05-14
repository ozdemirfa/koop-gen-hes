// Hafif CSV indirme yardımcısı. Sunucudan PDF üretmek yerine tarayıcıda CSV
// üretip Blob ile indiriyoruz. UTF-8 BOM Excel'de Türkçe karakter sorunsuzluğu
// sağlar; virgül yerine noktalı virgül kullanarak Türkçe ondalık ayraç (`,`)
// veri satırlarında bozulmadan kalır.

type CsvCellValue = string | number | boolean | null | undefined

export interface CsvSection {
  /** Bölüm başlığı (örn. "Aidat Tahsilatları"). Boş bırakılırsa başlık satırı yazılmaz. */
  title?: string
  /** Üst satırda görünecek kolon başlıkları. */
  headers: string[]
  /** Veri satırları; her satır headers ile aynı uzunlukta olmalı. */
  rows: CsvCellValue[][]
}

const escapeCell = (v: CsvCellValue): string => {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'number' ? v.toString().replace(/\./g, ',') : String(v)
  // CSV semicolon-separated; içinde ; varsa veya satır sonu varsa quote
  if (/[;"\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function buildCsv(sections: CsvSection[]): string {
  const lines: string[] = []
  sections.forEach((section, idx) => {
    if (idx > 0) lines.push('')
    if (section.title) {
      lines.push(escapeCell(section.title))
    }
    lines.push(section.headers.map(escapeCell).join(';'))
    section.rows.forEach((row) => {
      lines.push(row.map(escapeCell).join(';'))
    })
  })
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, sections: CsvSection[]) {
  const csv = buildCsv(sections)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
