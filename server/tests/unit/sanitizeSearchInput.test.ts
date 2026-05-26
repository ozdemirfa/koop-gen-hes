// Sprint security-quality-audit (2026-05-26):
// sanitizeSearchInput PostgREST .or()/.ilike() injection koruması.

import { describe, it, expect } from 'vitest'
import { sanitizeSearchInput } from '../../src/utils/projectGuard'

describe('sanitizeSearchInput', () => {
  it('normal Türkçe karakterleri korur', () => {
    expect(sanitizeSearchInput('Ahmet Yılmaz')).toBe('Ahmet Yılmaz')
    expect(sanitizeSearchInput('İçtüzük şart')).toBe('İçtüzük şart')
  })

  it('virgül strip eder (PostgREST OR delimiter)', () => {
    expect(sanitizeSearchInput('Ahmet,bypass.eq.null')).toBe('Ahmetbypass.eq.null')
  })

  it('parens strip eder', () => {
    expect(sanitizeSearchInput('test(injection)')).toBe('testinjection')
  })

  it('yüzde işareti strip eder (LIKE wildcard)', () => {
    expect(sanitizeSearchInput('100%')).toBe('100')
  })

  it('underscore strip eder (LIKE single-char wildcard)', () => {
    expect(sanitizeSearchInput('a_b_c')).toBe('abc')
  })

  it('asterisk strip eder', () => {
    expect(sanitizeSearchInput('test*')).toBe('test')
  })

  it('quote strip eder', () => {
    expect(sanitizeSearchInput('it\'s "ok"')).toBe('its ok')
  })

  it('backslash strip eder', () => {
    expect(sanitizeSearchInput('path\\to\\file')).toBe('pathtofile')
  })

  it('newline/tab/null strip eder', () => {
    expect(sanitizeSearchInput('a\nb\tc\0d')).toBe('abcd')
  })

  it('100 karakter limit', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeSearchInput(long).length).toBe(100)
  })

  it('string olmayan input boş döner', () => {
    expect(sanitizeSearchInput(null as any)).toBe('')
    expect(sanitizeSearchInput(undefined as any)).toBe('')
    expect(sanitizeSearchInput(123 as any)).toBe('')
    expect(sanitizeSearchInput({} as any)).toBe('')
  })

  it('boşlukları trim eder', () => {
    expect(sanitizeSearchInput('  hello  ')).toBe('hello')
  })

  it('PostgREST OR injection vektörü engellenir', () => {
    // Saldırı: search=foo,islem_turu.eq.hakedis → tüm hakedişleri döndürmeye çalışır
    const injected = 'foo,islem_turu.eq.hakedis'
    const safe = sanitizeSearchInput(injected)
    expect(safe).not.toContain(',')
    expect(safe).not.toContain('_')
    // Hem virgül hem underscore strip → fooislemturu.eq.hakedis
    expect(safe).toBe('fooislemturu.eq.hakedis')
  })
})
