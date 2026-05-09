import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingleMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => maybeSingleMock(),
        }),
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
    maybeSingleMock.mockReset()
  })

  it('returns role from DB on cache miss', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const role = await getUserRole('u1')
    expect(role).toBe('admin')
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('returns cached role on hit (no second DB call)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'staff' }, error: null })
    await getUserRole('u2')
    const role = await getUserRole('u2')
    expect(role).toBe('staff')
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('caches null role (user without role does not hit DB twice)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    await getUserRole('u3')
    await getUserRole('u3')
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('returns null and does not cache on DB error', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const role = await getUserRole('u4')
    expect(role).toBeNull()
    // Next call should hit DB again (not cached)
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    const role2 = await getUserRole('u4')
    expect(role2).toBe('admin')
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)
  })

  it('returns null on thrown exception', async () => {
    maybeSingleMock.mockRejectedValueOnce(new Error('network'))
    const role = await getUserRole('u5')
    expect(role).toBeNull()
  })

  it('clearRoleCache(userId) removes that entry only', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    await getUserRole('u6')
    clearRoleCache('u6')
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'staff' }, error: null })
    const role = await getUserRole('u6')
    expect(role).toBe('staff')
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown role values (treats as null)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { role: 'superuser' }, error: null })
    const role = await getUserRole('u7')
    expect(role).toBeNull()
  })
})
