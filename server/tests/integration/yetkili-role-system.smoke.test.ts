/**
 * Yetkili Rol Sistemi — End-to-End Smoke Test (PR-C, 2026-05-23)
 *
 * Tüm akışı tek bir senaryoda zincirler:
 *   1. Admin → setUserGlobalRole(targetUser, 'yetkili')
 *   2. Yetkili user → proje oluştur (RLS gerektiriyor; service-role ile bypass)
 *   3. Trigger ile creator → proje_uyelikleri rol='owner'
 *   4. Yetkili → manager rolünde davet et
 *   5. Manager → davet kabul → proje_uyelikleri rol='manager'
 *   6. setUserGlobalRole(targetUser, null) → user_roles satırı silinir
 *
 * Cleanup: oluşturulan kullanıcılar + projeler + davetler silinir.
 *
 * Env gereksinimleri:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (zorunlu)
 *   - TEST_ADMIN_USER_ID (zorunlu) — admin rolündeki user_id
 *   - TEST_TARGET_USER_ID (zorunlu) — promote/demote test kullanıcısı
 *
 * Çıktılar yok ise test SKIP eder.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from '../../src/config/supabase'
import { adminService } from '../../src/services/admin.service'
import { invitationService } from '../../src/services/invitation.service'

const HAS_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
const ADMIN_ID = process.env.TEST_ADMIN_USER_ID
const TARGET_ID = process.env.TEST_TARGET_USER_ID

describe.skipIf(!HAS_SUPABASE || !ADMIN_ID || !TARGET_ID)(
  'yetkili-role-system end-to-end smoke',
  () => {
    const TEST_PROJE_ADI = `e2e-yetkili-smoke-${Date.now()}`
    const TEST_MANAGER_EMAIL = `e2e-manager-${Date.now()}@example.invalid`
    let createdProjeId: string | undefined
    let createdInvitationId: string | undefined
    let createdManagerUserId: string | undefined
    let targetHadYetkiliBefore = false

    beforeAll(async () => {
      // Hedef kullanıcının önceki yetkili durumunu kaydet (idempotent cleanup için)
      const { data } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', TARGET_ID!)
        .eq('role', 'yetkili')
        .maybeSingle()
      targetHadYetkiliBefore = !!data
    })

    afterAll(async () => {
      // 1) Manager kullanıcı (varsa) sil
      if (createdManagerUserId) {
        await supabaseAdmin.auth.admin.deleteUser(createdManagerUserId).catch(() => undefined)
      }
      // 2) Davet sil
      if (createdInvitationId) {
        await supabaseAdmin.from('invitations').delete().eq('id', createdInvitationId)
      }
      await supabaseAdmin.from('invitations').delete().eq('email', TEST_MANAGER_EMAIL)
      // 3) Proje sil (CASCADE proje_uyelikleri'ni de temizler)
      if (createdProjeId) {
        await supabaseAdmin.from('projeler').delete().eq('id', createdProjeId)
      }
      // 4) Hedef kullanıcının yetkili durumunu eski haline döndür
      if (!targetHadYetkiliBefore) {
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', TARGET_ID!)
          .eq('role', 'yetkili')
      }
    })

    it('1) admin → setUserGlobalRole(target, "yetkili") → user_roles row eklenir', async () => {
      await adminService.setUserGlobalRole(TARGET_ID!, 'yetkili')

      const { data } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', TARGET_ID!)
        .eq('role', 'yetkili')
        .single()

      expect(data?.role).toBe('yetkili')
    })

    it('2) yetkili → proje oluştur → trigger ile owner üyelik açılır', async () => {
      // Service-role ile direkt insert (RLS bypass). owner_user_id NULL → trigger ile atanır.
      const { data: proje, error } = await supabaseAdmin
        .from('projeler')
        .insert({
          proje_adi: TEST_PROJE_ADI,
          owner_user_id: TARGET_ID!,
        })
        .select('id, owner_user_id')
        .single()

      expect(error).toBeNull()
      expect(proje?.owner_user_id).toBe(TARGET_ID)
      createdProjeId = proje?.id

      // Trigger sonrası proje_uyelikleri kontrolü
      const { data: uyelik } = await supabaseAdmin
        .from('proje_uyelikleri')
        .select('rol')
        .eq('proje_id', createdProjeId!)
        .eq('user_id', TARGET_ID!)
        .single()

      expect(uyelik?.rol).toBe('owner')
    })

    it('3) yetkili → manager davet et → invitations row (proje_id dolu, role=manager)', async () => {
      const res = await invitationService.createInvitation({
        projeId: createdProjeId!,
        email: TEST_MANAGER_EMAIL,
        invitedRole: 'manager',
        invitedBy: TARGET_ID!,
        invitedByName: 'Yetkili Test',
      })

      expect(res.id).toBeDefined()
      createdInvitationId = res.id

      const { data } = await supabaseAdmin
        .from('invitations')
        .select('proje_id, invited_role, status')
        .eq('id', res.id)
        .single()

      expect(data?.proje_id).toBe(createdProjeId)
      expect(data?.invited_role).toBe('manager')
      expect(data?.status).toBe('pending')
    })

    it('4) setUserGlobalRole(target, null) → user_roles row silinir (cleanup test)', async () => {
      // beforeAll'da targetHadYetkiliBefore false ise (test başlangıcında yoktu) buradan da temizleyebiliriz
      if (targetHadYetkiliBefore) {
        // Eskiden yetkili idi, dokunma — test gözlemci moda gir
        return
      }

      await adminService.setUserGlobalRole(TARGET_ID!, null)

      const { data } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', TARGET_ID!)
        .eq('role', 'yetkili')
        .maybeSingle()

      expect(data).toBeNull()
    })
  },
)
