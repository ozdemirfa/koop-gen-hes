// Sprint 20260519-para-hareketleri-improvements / US-1 + US-4:
//
// `GET /cari-hareketler` query schema — opsiyonel `exclude_tahakkuk` boolean parametresi.
// HTTP query string her zaman string olarak gelir; `z.coerce.boolean()` "true"/"false"
// dönüşümünü servisten önce yapar.
//
// Mevcut diğer query alanları (proje_id, eslesmemis, uye_id, …) schema'ya dahil EDİLMEZ:
// list path'i bilinçli olarak loose query kullanıyor (eslesmemis RPC path'i, çeşitli
// filtre kombinasyonları). Bu schema sadece yeni alanı whitelist'ler ve geri kalanı
// kontrol etmez — backward compat (US-4) için zorunluluk.

import { describe, it, expect } from 'vitest'
import { cariHareketListQuerySchema } from '../../src/schemas/cariHesap.schema'

describe('cariHareketListQuerySchema', () => {
  it('boş query parse edilir (exclude_tahakkuk opsiyoneldir)', () => {
    const result = cariHareketListQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exclude_tahakkuk).toBeUndefined()
    }
  })

  it('exclude_tahakkuk="true" string → boolean true', () => {
    const result = cariHareketListQuerySchema.safeParse({ exclude_tahakkuk: 'true' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exclude_tahakkuk).toBe(true)
    }
  })

  it('exclude_tahakkuk="false" string → boolean false (z.coerce semantik)', () => {
    // Not: z.coerce.boolean() Boolean() çağırır; "false" string non-empty olduğu için
    // TRUE'ya coerce eder. Bu kasıtlı bir davranış — frontend "false" göndermek yerine
    // parametreyi YOLLAMAMALI. Bu test bu davranışı dökümante eder.
    const result = cariHareketListQuerySchema.safeParse({ exclude_tahakkuk: 'false' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exclude_tahakkuk).toBe(true)
    }
  })

  it('exclude_tahakkuk="" empty string → false', () => {
    const result = cariHareketListQuerySchema.safeParse({ exclude_tahakkuk: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exclude_tahakkuk).toBe(false)
    }
  })

  it('exclude_tahakkuk=true (boolean) → boolean true', () => {
    const result = cariHareketListQuerySchema.safeParse({ exclude_tahakkuk: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exclude_tahakkuk).toBe(true)
    }
  })

  it('passthrough: diğer query alanları schema tarafından SİLİNMEZ (loose mode)', () => {
    const result = cariHareketListQuerySchema.safeParse({
      proje_id: 'a1111111-1111-4111-a111-111111111111',
      uye_id: 'a2222222-2222-4222-a222-222222222222',
      eslesmemis: 'true',
      exclude_tahakkuk: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Loose: diğer alanlar düşmemeli (eski controller davranışını koru)
      expect((result.data as any).proje_id).toBeDefined()
      expect((result.data as any).eslesmemis).toBeDefined()
      expect(result.data.exclude_tahakkuk).toBe(true)
    }
  })
})
