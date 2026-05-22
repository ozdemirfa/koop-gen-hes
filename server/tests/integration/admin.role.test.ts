/**
 * Integration smoke — PATCH /api/admin/users/:id/role (PR-A).
 *
 * Lokal/CI'da TEST_ADMIN_USER_ID + TEST_TARGET_USER_ID env vars set ise testler
 * gerçek Supabase'e konuşur; yoksa describe.skipIf ile atlanır.
 *
 * Bu testler **service layer**'a doğrudan çağrı yapar (HTTP layer için route-
 * level testler adminUsers.smoke.test.ts'te mock'lı şekilde mevcut). Buradaki
 * gerçek-DB testleri user_roles tablo davranışını doğrular.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { supabaseAdmin } from '../../src/config/supabase'
import { adminService } from '../../src/services/admin.service'

const TEST_TARGET_USER_ID = process.env.TEST_TARGET_USER_ID
const HAS_ENV = !!TEST_TARGET_USER_ID

describe.skipIf(!HAS_ENV)('admin.role integration (PR-A)', () => {
  beforeAll(async () => {
    // Test başlangıcında temizle — testler arası izolasyon
    if (!TEST_TARGET_USER_ID) return
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', TEST_TARGET_USER_ID)
      .in('role', ['yetkili', 'staff'])
  })

  afterEach(async () => {
    if (!TEST_TARGET_USER_ID) return
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', TEST_TARGET_USER_ID)
      .in('role', ['yetkili', 'staff'])
  })

  it('setUserGlobalRole(yetkili) → user_roles row insert', async () => {
    await adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, 'yetkili')

    const { data } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', TEST_TARGET_USER_ID!)
      .eq('role', 'yetkili')
      .maybeSingle()
    expect(data?.role).toBe('yetkili')
  })

  it('setUserGlobalRole(null) → user_roles satır silindi', async () => {
    // Önce yetkili ata
    await adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, 'yetkili')
    // Sonra revoke et
    await adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, null)

    const { data } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', TEST_TARGET_USER_ID!)
      .in('role', ['yetkili', 'staff'])
    expect(data ?? []).toHaveLength(0)
  })

  it('setUserGlobalRole(yetkili) idempotent — 2. çağrı hata vermez', async () => {
    await adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, 'yetkili')
    await expect(
      adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, 'yetkili'),
    ).resolves.not.toThrow()
  })

  it("setUserGlobalRole('admin') → 400 (reddedilir)", async () => {
    await expect(
      // @ts-expect-error admin tip union'da ama service reddeder
      adminService.setUserGlobalRole(TEST_TARGET_USER_ID!, 'admin'),
    ).rejects.toMatchObject({ statusCode: 400 })

    // user_roles'a admin INSERT yapılmamış olmalı
    const { data } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', TEST_TARGET_USER_ID!)
      .eq('role', 'admin')
    expect(data ?? []).toHaveLength(0)
  })
})
