/**
 * Integration smoke for davet akışı.
 *
 * Lokal/CI'da TEST_PROJE_ID + TEST_OWNER_ID env vars set ise testler gerçek
 * Supabase'e konuşur; yoksa describe.skipIf ile atlanır.
 *
 * Mock'lı pattern (örn. adminUsers.smoke.test.ts) yerine gerçek DB'ye konuşmayı
 * tercih ediyoruz çünkü davet akışı RLS + audit_logs + Argon2 hash gibi gerçek
 * sistem davranışlarını test ediyor.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { supabaseAdmin } from '../../src/config/supabase'
import { invitationService } from '../../src/services/invitation.service'

const TEST_PROJE_ID = process.env.TEST_PROJE_ID
const TEST_OWNER_ID = process.env.TEST_OWNER_ID

describe.skipIf(!TEST_PROJE_ID || !TEST_OWNER_ID)('invitations smoke', () => {
  const testEmail = `e2e-invite-${Date.now()}@example.invalid`

  afterAll(async () => {
    await supabaseAdmin.from('invitations').delete().eq('email', testEmail)
  })

  it('owner davet eder → invitations row + status=pending + token + otp_hash dolu', async () => {
    const res = await invitationService.createInvitation({
      projeId: TEST_PROJE_ID!,
      email: testEmail,
      invitedRole: 'user',
      invitedBy: TEST_OWNER_ID!,
      invitedByName: 'Test Owner',
    })
    expect(res.id).toBeDefined()
    expect(res.isNewUser).toBe(true)
    expect(res.email).toBe(testEmail)

    const { data } = await supabaseAdmin
      .from('invitations')
      .select('status, token, otp_hash, attempt_count')
      .eq('id', res.id)
      .single()
    expect(data?.status).toBe('pending')
    expect(data?.token).toBeTruthy()
    expect(data?.otp_hash).toBeTruthy()
    expect(data?.attempt_count).toBe(0)
  })

  it('aynı (proje, email) için ikinci pending davet 409', async () => {
    await expect(
      invitationService.createInvitation({
        projeId: TEST_PROJE_ID!,
        email: testEmail,
        invitedRole: 'user',
        invitedBy: TEST_OWNER_ID!,
        invitedByName: 'Test Owner',
      }),
    ).rejects.toThrow(/bekleyen davet/i)
  })

  it('yanlış OTP 5 kez → status=expired + attempt_count=5', async () => {
    const { data: inv } = await supabaseAdmin
      .from('invitations')
      .select('token')
      .eq('email', testEmail)
      .eq('status', 'pending')
      .single()
    expect(inv?.token).toBeTruthy()

    for (let i = 0; i < 5; i++) {
      await expect(
        invitationService.acceptInvitationByToken(inv!.token!, '000000', 'NewPass!23'),
      ).rejects.toThrow()
    }

    const { data: after } = await supabaseAdmin
      .from('invitations')
      .select('status, attempt_count')
      .eq('token', inv!.token!)
      .single()
    expect(after?.status).toBe('expired')
    expect(after?.attempt_count).toBe(5)
  })
})
