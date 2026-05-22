/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * Yetkili davet akışı integration smoke (env-gated).
 *
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars set ise gerçek DB'ye konuşur.
 *
 * Test akışı:
 *   1. createYetkiliInvitation → invitations row (proje_id NULL, invited_role='yetkili')
 *   2. Token + OTP ile acceptInvitationByToken → auth.users + user_roles=yetkili
 *   3. proje_uyelikleri'nde row yok (yetkili global rol → proje yok)
 *
 * Cleanup: oluşturulan kullanıcı + invitations rows silinir.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { supabaseAdmin } from '../../src/config/supabase'
import { invitationService } from '../../src/services/invitation.service'

const HAS_ENV = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
const TEST_ADMIN_ID = process.env.TEST_ADMIN_USER_ID

// Sadece SUPABASE creds VE TEST_ADMIN_USER_ID birlikte verilirse koşar
describe.skipIf(!HAS_ENV || !TEST_ADMIN_ID)('yetkili invitations smoke', () => {
  const testEmail = `e2e-yetkili-${Date.now()}@example.invalid`
  let createdInvitationId: string | undefined
  let createdUserId: string | undefined

  afterAll(async () => {
    // Cleanup — kullanıcı + davet
    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId).catch(() => undefined)
    }
    await supabaseAdmin.from('invitations').delete().eq('email', testEmail)
  })

  it('admin → createYetkiliInvitation → invitations row (proje_id NULL, role=yetkili)', async () => {
    const res = await invitationService.createYetkiliInvitation({
      email: testEmail,
      invitedBy: TEST_ADMIN_ID!,
      invitedByName: 'Admin Test',
    })
    expect(res.id).toBeDefined()
    expect(res.email).toBe(testEmail)
    createdInvitationId = res.id

    const { data } = await supabaseAdmin
      .from('invitations')
      .select('proje_id, invited_role, status, token, otp_hash')
      .eq('id', res.id)
      .single()
    expect(data?.proje_id).toBeNull()
    expect(data?.invited_role).toBe('yetkili')
    expect(data?.status).toBe('pending')
    expect(data?.token).toBeTruthy()
    expect(data?.otp_hash).toBeTruthy()
  })

  it('duplicate pending yetkili daveti → 409', async () => {
    await expect(
      invitationService.createYetkiliInvitation({
        email: testEmail,
        invitedBy: TEST_ADMIN_ID!,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  // Bu testin koşması için createYetkiliInvitation'ın otp_plain'i geri döndürmesi
  // gerekir; ancak servisin imzası gizli tutuyor (mail ile gönderiyor). Burada
  // doğrudan DB'den token'ı okuyup, OTP'yi yeniden üretemediğimiz için OTP'nin
  // mail ile gittiğini kabul edip yalnızca OTP-mismatch attempt path'ini test
  // ediyoruz. Production OTP'yi response'ta dönmüyoruz — bu davranış doğru.
  it('yanlış OTP attempt → 400 ve attempt_count artar', async () => {
    if (!createdInvitationId) return
    const { data: inv } = await supabaseAdmin
      .from('invitations')
      .select('token, attempt_count')
      .eq('id', createdInvitationId)
      .single()
    expect(inv?.token).toBeTruthy()

    const beforeCount = inv?.attempt_count ?? 0

    await expect(
      invitationService.acceptInvitationByToken(inv!.token!, '000000', 'StrongPw!23'),
    ).rejects.toThrow()

    const { data: after } = await supabaseAdmin
      .from('invitations')
      .select('attempt_count')
      .eq('id', createdInvitationId!)
      .single()
    expect((after?.attempt_count ?? 0)).toBeGreaterThan(beforeCount)
  })

  // NOT: Happy path (kabul + user_roles row) için OTP'yi test ortamında
  // bilmek gerekiyor. createYetkiliInvitation response'unda OTP plaintext yok
  // (güvenlik). Bu nedenle happy path testi için ya mailer mock'lanmalı ya
  // bilinen bir OTP enjekte edilmeli — bu testi mock'lı unit testte
  // (invitation.service.yetkili.test.ts) zaten kapsadık.
})
