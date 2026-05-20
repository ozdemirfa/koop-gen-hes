// Sprint role-system-modernization (PR-B):
// projeUyelikService — owner/manager/user guard'larını izole birim testle doğrula.
//
// Kuralları:
//   - Yeni atama akışı yalnızca owner/manager/user kabul eder; legacy değerler 400.
//   - 'owner' rolü asla yeni atama olarak verilemez (transfer akışı yok).
//   - Mevcut bir 'owner' üyesinin rolü asla değiştirilemez.
//   - 'owner' rolündeki üye removeMember ile silinemez.
//   - Caller (request user) kendisinin rolünü/üyeliğini değiştiremez/silemez.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Builder state — her test 'mevcut rol'ü reset eder.
let mockExistingRole: string | null = null

vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.from = chain
  builder.select = chain
  builder.insert = chain
  builder.update = chain
  builder.delete = chain
  builder.upsert = chain
  builder.eq = chain
  builder.in = chain
  builder.order = chain
  // .single() upsert chain'i için success obj döndür
  builder.single = async () => ({
    data: { user_id: 'u-target', proje_id: 'p1', rol: 'user' },
    error: null,
  })
  // .maybeSingle() mevcut rol lookup için
  builder.maybeSingle = async () => {
    if (mockExistingRole === null) return { data: null, error: null }
    return { data: { rol: mockExistingRole }, error: null }
  }

  return {
    supabaseAdmin: {
      from: () => builder,
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { id: 'u-target', email: 't@b.com' } }, error: null }),
        },
      },
    },
  }
})

vi.mock('../../src/middleware/projectAccessCache', () => ({
  clearProjectAccessCache: vi.fn(),
}))

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { projeUyelikService } from '../../src/services/projeUyelik.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE_ID = 'p-1111'
const TARGET_USER = 'u-target'
const CALLER_USER = 'u-caller'

describe('projeUyelikService — PR-B guard rules', () => {
  beforeEach(() => {
    mockExistingRole = null
  })

  describe('upsertMember', () => {
    it('legacy rol="staff" → 400 (assertNewRole)', async () => {
      mockExistingRole = null
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'staff' as any),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it('legacy rol="viewer" → 400', async () => {
      mockExistingRole = null
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'viewer' as any),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it('bilinmeyen rol → 400', async () => {
      mockExistingRole = null
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'superuser' as any),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it('caller kendi rolünü değiştiremez → 403', async () => {
      mockExistingRole = 'user'
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, CALLER_USER, 'manager', { callerId: CALLER_USER }),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('mevcut owner üyesinin rolü manager yapılamaz → 403', async () => {
      mockExistingRole = 'owner'
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'manager'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('yeni "owner" ataması yapılamaz → 403 (transfer akışı yok)', async () => {
      mockExistingRole = 'user' // mevcut user; owner yapmaya çalış
      await expect(
        projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'owner'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('user → manager terfi → başarılı', async () => {
      mockExistingRole = 'user'
      const res = await projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'manager')
      expect(res).toBeDefined()
      expect(res.email).toBe('t@b.com')
    })

    it('yeni üye olarak "user" ekle → başarılı', async () => {
      mockExistingRole = null
      const res = await projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'user')
      expect(res).toBeDefined()
    })

    it('owner kendine owner olarak no-op → izin verir (idempotent)', async () => {
      // Bu senaryo gerçekte controller seviyesinde callerId !== targetId garantili
      // olduğu için tetiklenmez; service ayrıca currentRole==='owner' ve rol==='owner'
      // ise hiçbir guard fırlatmaz, sadece üyelik upsert eder.
      mockExistingRole = 'owner'
      const res = await projeUyelikService.upsertMember(PROJE_ID, TARGET_USER, 'owner')
      expect(res).toBeDefined()
    })
  })

  describe('removeMember', () => {
    it('caller kendisini silemez → 403', async () => {
      mockExistingRole = 'user'
      await expect(
        projeUyelikService.removeMember(PROJE_ID, CALLER_USER, { callerId: CALLER_USER }),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('owner üyesi silinemez → 403', async () => {
      mockExistingRole = 'owner'
      await expect(
        projeUyelikService.removeMember(PROJE_ID, TARGET_USER),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('manager üyesi silinebilir → success', async () => {
      mockExistingRole = 'manager'
      const res = await projeUyelikService.removeMember(PROJE_ID, TARGET_USER)
      expect(res).toEqual({ success: true })
    })

    it('user üyesi silinebilir → success', async () => {
      mockExistingRole = 'user'
      const res = await projeUyelikService.removeMember(PROJE_ID, TARGET_USER)
      expect(res).toEqual({ success: true })
    })
  })
})
