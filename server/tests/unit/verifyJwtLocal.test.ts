/**
 * Sprint 20260511-open-backlog-sprint (SEC-013) — JWT lokal verify unit test
 *
 * verifyJwtLocal()'in 4 senaryoyu dogru handle ettigini test eder:
 *   1. Happy path — gecerli HS256 token → { id, email } payload
 *   2. Expired token → null doner (fallback'e dusulur)
 *   3. Invalid signature → null doner (fallback'e dusulur)
 *   4. Malformed token → null doner (try/catch icinde yutulur)
 *
 * Test setup (tests/setup/env.ts): SUPABASE_JWT_SECRET="super-secret-key-just-for-tests-32+chars-long"
 */

import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { verifyJwtLocal } from '../../src/middleware/auth'

const TEST_SECRET = 'super-secret-key-just-for-tests-32+chars-long'
const WRONG_SECRET = 'wrong-secret-key-for-signature-mismatch-test!'

const secretBytes = new TextEncoder().encode(TEST_SECRET)

async function makeToken(opts: {
  sub: string
  email?: string
  expIn?: string
  signWith?: Uint8Array
}): Promise<string> {
  const jwt = new SignJWT({
    sub: opts.sub,
    email: opts.email,
    role: 'authenticated',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(opts.expIn ?? '1h')
  return await jwt.sign(opts.signWith ?? secretBytes)
}

describe('verifyJwtLocal', () => {
  it('happy path — gecerli HS256 token → { id, email } doner', async () => {
    const token = await makeToken({ sub: 'user-123', email: 'test@example.com' })
    const result = await verifyJwtLocal(token)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('user-123')
    expect(result!.email).toBe('test@example.com')
  })

  it('email payload yoksa undefined ile doner', async () => {
    const token = await makeToken({ sub: 'user-no-email' })
    const result = await verifyJwtLocal(token)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('user-no-email')
    expect(result!.email).toBeUndefined()
  })

  it('expired token → null doner', async () => {
    const expiredToken = await makeToken({
      sub: 'user-456',
      email: 'expired@example.com',
      expIn: '-1m',  // gecmiste expire
    })
    const result = await verifyJwtLocal(expiredToken)
    expect(result).toBeNull()
  })

  it('invalid signature → null doner', async () => {
    const wrongSigToken = await makeToken({
      sub: 'user-789',
      email: 'wrong@example.com',
      signWith: new TextEncoder().encode(WRONG_SECRET),
    })
    const result = await verifyJwtLocal(wrongSigToken)
    expect(result).toBeNull()
  })

  it('malformed token → null doner (try/catch icinde yutulur)', async () => {
    const result = await verifyJwtLocal('not.a.valid.jwt')
    expect(result).toBeNull()
  })
})
