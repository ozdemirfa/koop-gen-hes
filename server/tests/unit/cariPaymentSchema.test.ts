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

  it('rejects uyelik_baslangic with banka_hesap_id (no banka movement allowed)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      islem_turu: 'uyelik_baslangic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown islem_turu', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'random_unknown' })
    expect(result.success).toBe(false)
  })
})
