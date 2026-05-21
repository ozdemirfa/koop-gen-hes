import { describe, it, expect } from 'vitest'
import {
  hashOtp,
  verifyOtp,
  generateInviteToken,
  generateOtpCode,
} from '../../src/services/invitation.helpers'

describe('invitation.helpers', () => {
  describe('generateOtpCode', () => {
    it('6 haneli rakamdan oluşan kod döner', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateOtpCode()
        expect(code).toMatch(/^\d{6}$/)
      }
    })
  })

  describe('generateInviteToken', () => {
    it('base64url formatında, en az 40 karakter token döner', () => {
      const t = generateInviteToken()
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(t.length).toBeGreaterThanOrEqual(40)
    })

    it('iki token aynı olmaz (entropy)', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        tokens.add(generateInviteToken())
      }
      expect(tokens.size).toBe(1000)
    })
  })

  describe('hashOtp / verifyOtp', () => {
    it('hash plaintext kodu içermez', async () => {
      const code = '123456'
      const hash = await hashOtp(code)
      expect(hash).not.toContain(code)
      expect(hash.length).toBeGreaterThan(20)
    })

    it('doğru kod verify TRUE döner', async () => {
      const code = '654321'
      const hash = await hashOtp(code)
      expect(await verifyOtp(hash, code)).toBe(true)
    })

    it('yanlış kod verify FALSE döner', async () => {
      const hash = await hashOtp('111111')
      expect(await verifyOtp(hash, '222222')).toBe(false)
    })
  })
})
