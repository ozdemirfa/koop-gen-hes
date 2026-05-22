/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * adminService.setUserGlobalRole — unit testler.
 *
 * Kapsam:
 *   - role='yetkili' → user_roles upsert + clearRoleCache
 *   - role='staff'   → user_roles staff upsert + yetkili row sil
 *   - role=null      → user_roles satırlarını sil (yetkili+staff)
 *   - role='admin'   → reject (ApiError 400)
 *   - audit log (logger.info) çağrılır
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocking state — testler reset eder
interface UpsertCall {
  table: string
  payload: any
  onConflict?: string
}
interface DeleteCall {
  table: string
  filters: Record<string, any>
}

let mockUpsertCalls: UpsertCall[] = []
let mockDeleteCalls: DeleteCall[] = []
let mockUpsertError: any = null
let mockDeleteError: any = null

vi.mock('../../src/config/supabase', () => {
  function makeBuilder(table: string) {
    const filters: Record<string, any> = {}

    // Terminal: bir delete chain bittiğinde delete kaydını oluşturur ve resolve eder
    function terminalThen(resolve: any) {
      mockDeleteCalls.push({ table, filters: { ...filters } })
      resolve({ data: null, error: mockDeleteError })
    }

    const deleteChain: any = {
      eq(col: string, val: any) {
        filters[col] = val
        return deleteChain
      },
      in(col: string, vals: any[]) {
        filters[col] = vals
        return deleteChain
      },
      then(resolve: any) {
        terminalThen(resolve)
      },
    }

    return {
      delete() {
        return deleteChain
      },
      async upsert(payload: any, opts?: { onConflict?: string }) {
        mockUpsertCalls.push({ table, payload, onConflict: opts?.onConflict })
        return { data: null, error: mockUpsertError }
      },
      select() {
        return this
      },
      eq() {
        return this
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    }
  }

  return {
    supabaseAdmin: {
      from: (table: string) => makeBuilder(table),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    },
  }
})

vi.mock('../../src/middleware/roleCache', () => ({
  clearRoleCache: vi.fn(),
  getUserRole: vi.fn(),
  ROLE_RANK: { admin: 3, yetkili: 2, staff: 1 },
}))

vi.mock('../../src/middleware/projectAccessCache', () => ({
  clearProjectAccessCache: vi.fn(),
}))

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import logger from '../../src/utils/logger'
import { clearRoleCache } from '../../src/middleware/roleCache'
import { adminService } from '../../src/services/admin.service'

const mockedClearRoleCache = vi.mocked(clearRoleCache)
const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>

const USER_ID = 'user-uuid-1'

describe('adminService.setUserGlobalRole (PR-A)', () => {
  beforeEach(() => {
    mockUpsertCalls = []
    mockDeleteCalls = []
    mockUpsertError = null
    mockDeleteError = null
    mockedClearRoleCache.mockClear()
    mockLoggerInfo.mockClear()
  })

  it('role=yetkili → user_roles upsert ile yetkili row eklenir', async () => {
    await adminService.setUserGlobalRole(USER_ID, 'yetkili')

    const upsert = mockUpsertCalls.find((c) => c.table === 'user_roles')
    expect(upsert).toBeDefined()
    expect(upsert?.payload).toEqual({ user_id: USER_ID, role: 'yetkili' })
    expect(upsert?.onConflict).toBe('user_id,role')
  })

  it('role=yetkili → staff row varsa önce silinir (hijyen)', async () => {
    await adminService.setUserGlobalRole(USER_ID, 'yetkili')
    const del = mockDeleteCalls.find(
      (c) => c.table === 'user_roles' && c.filters.role === 'staff',
    )
    expect(del).toBeDefined()
    expect(del?.filters.user_id).toBe(USER_ID)
  })

  it('role=staff → user_roles staff upsert + yetkili sil', async () => {
    await adminService.setUserGlobalRole(USER_ID, 'staff')

    const upsert = mockUpsertCalls.find((c) => c.table === 'user_roles')
    expect(upsert?.payload).toEqual({ user_id: USER_ID, role: 'staff' })
    const del = mockDeleteCalls.find(
      (c) => c.table === 'user_roles' && c.filters.role === 'yetkili',
    )
    expect(del).toBeDefined()
  })

  it('role=null → user_roles satırlarını sil (yetkili+staff), upsert YOK', async () => {
    await adminService.setUserGlobalRole(USER_ID, null)

    expect(mockUpsertCalls).toHaveLength(0)
    const del = mockDeleteCalls.find((c) => c.table === 'user_roles')
    expect(del).toBeDefined()
    expect(del?.filters.user_id).toBe(USER_ID)
    expect(del?.filters.role).toEqual(['yetkili', 'staff'])
  })

  it("role='admin' → ApiError 400 (reddedilir)", async () => {
    // @ts-expect-error admin allowed type olarak değil, runtime defansı
    await expect(adminService.setUserGlobalRole(USER_ID, 'admin')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(mockUpsertCalls).toHaveLength(0)
    expect(mockedClearRoleCache).not.toHaveBeenCalled()
  })

  it('başarılı atama sonrası clearRoleCache(userId) çağrılır', async () => {
    await adminService.setUserGlobalRole(USER_ID, 'yetkili')
    expect(mockedClearRoleCache).toHaveBeenCalledWith(USER_ID)
  })

  it('başarılı revoke sonrası clearRoleCache(userId) çağrılır', async () => {
    await adminService.setUserGlobalRole(USER_ID, null)
    expect(mockedClearRoleCache).toHaveBeenCalledWith(USER_ID)
  })

  it("audit log: assigned event yazılır (role='yetkili')", async () => {
    await adminService.setUserGlobalRole(USER_ID, 'yetkili')
    const calls = mockLoggerInfo.mock.calls.map((c) => String(c[0]))
    expect(calls.some((m) => m.includes('admin.role.assigned') && m.includes(USER_ID))).toBe(true)
  })

  it('audit log: revoked event yazılır (role=null)', async () => {
    await adminService.setUserGlobalRole(USER_ID, null)
    const calls = mockLoggerInfo.mock.calls.map((c) => String(c[0]))
    expect(calls.some((m) => m.includes('admin.role.revoked') && m.includes(USER_ID))).toBe(true)
  })

  it('DB upsert hatası → ApiError 500', async () => {
    mockUpsertError = { code: 'XX000', message: 'db failure' }
    await expect(adminService.setUserGlobalRole(USER_ID, 'yetkili')).rejects.toMatchObject({
      statusCode: 500,
    })
    expect(mockedClearRoleCache).not.toHaveBeenCalled()
  })

  it('DB delete hatası (revoke) → ApiError 500', async () => {
    mockDeleteError = { code: 'XX000', message: 'db failure' }
    await expect(adminService.setUserGlobalRole(USER_ID, null)).rejects.toMatchObject({
      statusCode: 500,
    })
  })
})
