/**
 * Davet akışı için kriptografik helper'lar.
 *
 *   - generateInviteToken: URL'de gözüken random secret (256 bit entropi)
 *   - generateOtpCode: 6 haneli kod (kullanıcıya mail'de gönderilir)
 *   - hashOtp/verifyOtp: Argon2id; plaintext kod hiç saklanmaz
 *
 * Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md §5.3
 */

import { randomBytes, randomInt } from 'crypto'
import argon2 from 'argon2'

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function generateOtpCode(): string {
  // 6 haneli, leading-zero olmayacak şekilde (100000–999999)
  return randomInt(100000, 1_000_000).toString()
}

export async function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, {
    type: argon2.argon2id,
    memoryCost: 19_456, // ~19MB (OWASP minimum)
    timeCost: 2,
    parallelism: 1,
  })
}

export async function verifyOtp(hash: string, otp: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, otp)
  } catch {
    return false
  }
}
