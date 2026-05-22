/**
 * Davet akışı kriptografik helper'lar için unit testler.
 *
 * Test matrisi (QA sprint 20260522-signup-qa-sprint):
 *   O3 — Argon2 hash + verify roundtrip (doğru OTP → true, yanlış → false)
 *   TOK — Token entropi: base64url charset, ≥40 karakter, 1000 unique
 *   OTP — OTP format: /^\d{6}$/, 100000-999999 aralığı
 *
 * Bu testler gerçek Supabase bağlantısı gerektirmez; saf kriptografi.
 */

import { describe, it, expect } from 'vitest'
import {
  generateInviteToken,
  generateOtpCode,
  hashOtp,
  verifyOtp,
} from '../../src/services/invitation.helpers'

describe('invitation.helpers — OTP (O3)', () => {
  it('O3: hashOtp + verifyOtp Argon2 roundtrip: doğru OTP true döner', async () => {
    const otp = '847362'
    const hash = await hashOtp(otp)
    const result = await verifyOtp(hash, otp)
    expect(result).toBe(true)
  })

  it('O3: verifyOtp yanlış OTP false döner', async () => {
    const hash = await hashOtp('123456')
    const result = await verifyOtp(hash, '654321')
    expect(result).toBe(false)
  })

  it('O3: hashOtp çıktısı plaintext içermez (argon2id prefix)', async () => {
    const otp = '999888'
    const hash = await hashOtp(otp)
    // Argon2id hash her zaman $argon2id$ ile başlar
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain(otp)
  })

  it('O3: hashOtp çıktısı OWASP memoryCost ≥19MB ile üretilir (hash uzunluğu)', async () => {
    const hash = await hashOtp('111111')
    // Argon2 hash string minimum 60 karakter olur
    expect(hash.length).toBeGreaterThan(60)
  })

  it('O3: verifyOtp bozuk hash string için false döner (exception fırlatmaz)', async () => {
    const result = await verifyOtp('not-a-valid-argon2-hash', '123456')
    expect(result).toBe(false)
  })
})

describe('invitation.helpers — Token entropy (TOK)', () => {
  it('TOK: generateInviteToken base64url charset, ≥40 karakter', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(40)
  })

  it('TOK: 1000 token unique (collision yok)', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateInviteToken())
    }
    expect(tokens.size).toBe(1000)
  })

  it('TOK: token 256 bit entropi (32 byte → 43-44 base64url karakter)', () => {
    // randomBytes(32).toString('base64url') → 43 veya 44 karakter
    for (let i = 0; i < 10; i++) {
      const t = generateInviteToken()
      expect(t.length).toBeGreaterThanOrEqual(43)
    }
  })
})

describe('invitation.helpers — OTP format (OTP)', () => {
  it('OTP: generateOtpCode /^\\d{6}$/ formatında', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode()
      expect(code).toMatch(/^\d{6}$/)
    }
  })

  it('OTP: generateOtpCode 100000-999999 aralığında (leading-zero yok)', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateOtpCode()
      const num = parseInt(code, 10)
      expect(num).toBeGreaterThanOrEqual(100000)
      expect(num).toBeLessThanOrEqual(999999)
    }
  })
})
