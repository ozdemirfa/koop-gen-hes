import { describe, it, expect } from 'vitest'
import { cariPaymentSchema } from '../../src/schemas/cariHesap.schema'

const baseValid = {
  proje_id: '11111111-1111-4111-8111-111111111111',
  cari_hesap_id: '22222222-2222-4222-8222-222222222222',
  tutar: 1000,
  tarih: '2026-05-10',
  odeme_turu: 'banka',
  banka_hesap_id: '33333333-3333-4333-8333-333333333333',
}

const VALID_CEK_ID = '44444444-4444-4444-8444-444444444444'

describe('cariPaymentSchema', () => {
  it('accepts gelen_odeme (existing behavior)', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'gelen_odeme' })
    expect(result.success).toBe(true)
  })

  it('accepts iade_odeme with banka payload', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'iade_odeme' })
    expect(result.success).toBe(true)
  })

  it('accepts uyelik_baslangic without banka payload', () => {
    const { banka_hesap_id, odeme_turu, ...minimal } = baseValid
    const result = cariPaymentSchema.safeParse({
      ...minimal,
      islem_turu: 'uyelik_baslangic',
      odeme_turu: 'cari',
    })
    expect(result.success).toBe(true)
  })

  // REV-PAY-03 (2026-05-12): uyelik_baslangic hibrit semantik — TAHAKKUK (cari) +
  // TAHSILAT (banka/nakit/cek/kredi_karti) artık ikisi de geçerli. Eski TASK-BE-04
  // yasak kuralları kaldırıldı.
  it('accepts uyelik_baslangic with banka_hesap_id (tahsilat path)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      islem_turu: 'uyelik_baslangic',
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown islem_turu', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'random_unknown' })
    expect(result.success).toBe(false)
  })

  // === REV-PAY-03 — hibrit semantik testleri ===

  it('accepts uyelik_baslangic with cek_id + vade_tarihi (tahsilat path)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      islem_turu: 'uyelik_baslangic',
      cek_id: VALID_CEK_ID,
      vade_tarihi: '2026-06-01',
    })
    expect(result.success).toBe(true)
  })

  it('accepts uyelik_baslangic with vade_tarihi on cek path', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      islem_turu: 'uyelik_baslangic',
      vade_tarihi: '2026-06-01',
    })
    expect(result.success).toBe(true)
  })

  it('accepts uyelik_baslangic with banka (bank name) field on cek path', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      vade_tarihi: '2026-06-30',
      islem_turu: 'uyelik_baslangic',
      banka: 'Garanti BBVA',
    })
    expect(result.success).toBe(true)
  })

  it('accepts uyelik_baslangic with sube field on cek path', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      vade_tarihi: '2026-06-30',
      islem_turu: 'uyelik_baslangic',
      sube: 'Kadıköy',
    })
    expect(result.success).toBe(true)
  })

  it('rejects banka payment without banka_hesap_id (defense-in-depth)', () => {
    const { banka_hesap_id, ...minimal } = baseValid
    const result = cariPaymentSchema.safeParse({
      ...minimal,
      islem_turu: 'gelen_odeme',
      odeme_turu: 'banka',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ')
      expect(message).toMatch(/banka_hesap_id/i)
    }
  })

  it('rejects iade_odeme with odeme_turu=cari (refund must hit a bank/nakit/cek path)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      islem_turu: 'iade_odeme',
      odeme_turu: 'cari',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ')
      expect(message).toMatch(/iade_odeme/i)
    }
  })

  it('rejects tutar above the 1 billion TRY upper bound', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      islem_turu: 'gelen_odeme',
      tutar: 1_000_000_001,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative or zero tutar (existing positive() guard still works)', () => {
    expect(
      cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'gelen_odeme', tutar: 0 }).success,
    ).toBe(false)
    expect(
      cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'gelen_odeme', tutar: -10 }).success,
    ).toBe(false)
  })

  it('rejects cek payment without vade_tarihi (server-side default removed)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      islem_turu: 'giden_odeme',
      cek_id: VALID_CEK_ID,
      // vade_tarihi intentionally omitted
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ')
      expect(message).toMatch(/vade_tarihi/i)
    }
  })

  it('accepts cek payment when vade_tarihi is provided', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      banka_hesap_id: undefined,
      odeme_turu: 'cek',
      islem_turu: 'giden_odeme',
      cek_id: VALID_CEK_ID,
      vade_tarihi: '2026-06-30',
    })
    expect(result.success).toBe(true)
  })

  it('accepts tutar at the 1 billion TRY boundary (inclusive)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      islem_turu: 'gelen_odeme',
      tutar: 1_000_000_000,
    })
    expect(result.success).toBe(true)
  })
})
