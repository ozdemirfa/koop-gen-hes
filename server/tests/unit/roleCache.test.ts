import { describe, it, expect, vi, beforeEach } from 'vitest'

const eqMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => eqMock(...args),
      }),
    }),
  },
}))

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { getUserRole, clearRoleCache } from '../../src/middleware/roleCache'

describe('roleCache', () => {
  beforeEach(() => {
    clearRoleCache()
    eqMock.mockReset()
  })

  it('returns role from DB on cache miss', async () => {
    eqMock.mockResolvedValueOnce({ data: [{ role: 'admin' }], error: null })
    const role = await getUserRole('u1')
    expect(role).toBe('admin')
    expect(eqMock).toHaveBeenCalledTimes(1)
  })

  it('returns cached role on hit (no second DB call)', async () => {
    eqMock.mockResolvedValueOnce({ data: [{ role: 'staff' }], error: null })
    await getUserRole('u2')
    const role = await getUserRole('u2')
    expect(role).toBe('staff')
    expect(eqMock).toHaveBeenCalledTimes(1)
  })

  it('caches null role (user without role does not hit DB twice)', async () => {
    eqMock.mockResolvedValueOnce({ data: [], error: null })
    await getUserRole('u3')
    await getUserRole('u3')
    expect(eqMock).toHaveBeenCalledTimes(1)
  })

  it('returns null and does not cache on DB error', async () => {
    eqMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const role = await getUserRole('u4')
    expect(role).toBeNull()
    // Next call should hit DB again (not cached)
    eqMock.mockResolvedValueOnce({ data: [{ role: 'admin' }], error: null })
    const role2 = await getUserRole('u4')
    expect(role2).toBe('admin')
    expect(eqMock).toHaveBeenCalledTimes(2)
  })

  it('returns null on thrown exception', async () => {
    eqMock.mockRejectedValueOnce(new Error('network'))
    const role = await getUserRole('u5')
    expect(role).toBeNull()
  })

  it('clearRoleCache(userId) removes that entry only', async () => {
    eqMock.mockResolvedValueOnce({ data: [{ role: 'admin' }], error: null })
    await getUserRole('u6')
    clearRoleCache('u6')
    eqMock.mockResolvedValueOnce({ data: [{ role: 'staff' }], error: null })
    const role = await getUserRole('u6')
    expect(role).toBe('staff')
    expect(eqMock).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown role values (treats as null)', async () => {
    eqMock.mockResolvedValueOnce({ data: [{ role: 'superuser' }], error: null })
    const role = await getUserRole('u7')
    expect(role).toBeNull()
  })

  it('multi-row: admin + staff → admin (hierarchy)', async () => {
    eqMock.mockResolvedValueOnce({
      data: [{ role: 'staff' }, { role: 'admin' }],
      error: null,
    })
    const role = await getUserRole('u-multi')
    expect(role).toBe('admin')
  })

  it('multi-row: only staff rows → staff', async () => {
    eqMock.mockResolvedValueOnce({
      data: [{ role: 'staff' }],
      error: null,
    })
    const role = await getUserRole('u-staff-only')
    expect(role).toBe('staff')
  })
})
