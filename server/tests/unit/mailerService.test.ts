// Sprint qa-review-bugfix-faz3 Batch 3 — mailer.service unit testleri
// Brevo stub mode (API key yokken) + sendNewUserInvite/sendExistingUserInvite
// payload render kontrolü.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mailer module-import sırasında BREVO_API_KEY okur. Stub mode için undefined.
delete process.env.BREVO_API_KEY

const fetchMock = vi.fn()
;(globalThis as any).fetch = fetchMock

import { mailer } from '../../src/services/mailer.service'

beforeEach(() => {
  fetchMock.mockReset()
})

describe('mailer (stub mode)', () => {
  it('sendNewUserInvite — BREVO_API_KEY yok → fetch çağırmaz (stub log)', async () => {
    await mailer.sendNewUserInvite({
      to: 'a@b.com',
      projeAdi: 'Test Projesi',
      inviterName: 'Admin',
      role: 'manager',
      acceptUrl: 'https://x/accept/abc',
      otpCode: '123456',
      expiresAt: new Date('2026-12-31'),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sendExistingUserInvite — stub mode davet linki + tarih render eder (no throw)', async () => {
    await expect(
      mailer.sendExistingUserInvite({
        to: 'a@b.com',
        projeAdi: 'Test',
        inviterName: 'Admin',
        role: 'user',
        loginUrl: 'https://x/login',
        expiresAt: new Date('2026-12-31'),
      }),
    ).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
