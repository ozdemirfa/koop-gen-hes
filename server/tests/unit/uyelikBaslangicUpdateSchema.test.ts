// Sprint uyelik-baslangic-iptal-duzenle (2026-05-25)
// uyelikBaslangicUpdateSchema Zod validasyon testleri.
// Strict mode + interceptor proje_id/projeId whitelist davranisi.

import { describe, it, expect } from 'vitest'
import { uyelikBaslangicUpdateSchema, TUTAR_UPPER_BOUND } from '../../src/schemas/cariHesap.schema'

describe('uyelikBaslangicUpdateSchema', () => {
  it('happy path — tutar+tarih+aciklama ok', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 10000,
      tarih: '2026-05-25',
      aciklama: 'Duzenleme',
    })
    expect(r.success).toBe(true)
  })

  it('aciklama opsiyonel — eksik gecer', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
    })
    expect(r.success).toBe(true)
  })

  it('aciklama null gecer (nullable)', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      aciklama: null,
    })
    expect(r.success).toBe(true)
  })

  it('proje_id (interceptor field) gecer ama service kullanmaz', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      proje_id: 'a1111111-1111-4111-a111-111111111111',
    })
    expect(r.success).toBe(true)
  })

  it('projeId camelCase varyanti da gecer', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      projeId: 'a1111111-1111-4111-a111-111111111111',
    })
    expect(r.success).toBe(true)
  })

  it('strict mode — bilinmeyen field reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      islem_turu: 'aidat_kayit', // mass-assignment denemesi
    })
    expect(r.success).toBe(false)
  })

  it('strict mode — kaynak_tipi reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      kaynak_tipi: 'baslangic_bedeli',
    })
    expect(r.success).toBe(false)
  })

  it('tutar negatif → reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: -100,
      tarih: '2026-05-25',
    })
    expect(r.success).toBe(false)
  })

  it('tutar 0 → reddedilir (positive)', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 0,
      tarih: '2026-05-25',
    })
    expect(r.success).toBe(false)
  })

  it('tutar TUTAR_UPPER_BOUND uzeri → reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: TUTAR_UPPER_BOUND + 1,
      tarih: '2026-05-25',
    })
    expect(r.success).toBe(false)
  })

  it('tutar TUTAR_UPPER_BOUND sinirda → kabul', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: TUTAR_UPPER_BOUND,
      tarih: '2026-05-25',
    })
    expect(r.success).toBe(true)
  })

  it('tarih ISO format degil → reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '25-05-2026',
    })
    expect(r.success).toBe(false)
  })

  it('tarih eksik → reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({ tutar: 5000 })
    expect(r.success).toBe(false)
  })

  it('aciklama 1000 karakter uzeri → reddedilir', () => {
    const r = uyelikBaslangicUpdateSchema.safeParse({
      tutar: 5000,
      tarih: '2026-05-25',
      aciklama: 'x'.repeat(1001),
    })
    expect(r.success).toBe(false)
  })
})
