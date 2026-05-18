import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingleMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: (...args: unknown[]) => maybeSingleMock(...args),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('../../src/utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { getProjectRole, clearProjectAccessCache } from '../../src/middleware/projectAccessCache'

const USER_ID = 'user-1'
const PROJE_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_PROJE_ID = '22222222-2222-2222-2222-222222222222'

describe('projectAccessCache', () => {
  beforeEach(() => {
    clearProjectAccessCache()
    maybeSingleMock.mockReset()
  })

  it('returns role from DB on cache miss', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    const role = await getProjectRole(USER_ID, PROJE_ID)
    expect(role).toBe('staff')
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('returns cached role on hit (no second DB call)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'viewer' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    const role = await getProjectRole(USER_ID, PROJE_ID)
    expect(role).toBe('viewer')
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('caches null role (non-member does not hit DB twice)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    await getProjectRole(USER_ID, PROJE_ID)
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })

  it('returns null and does not cache on DB error', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const role = await getProjectRole(USER_ID, PROJE_ID)
    expect(role).toBeNull()
    // Sonraki çağrı yeniden DB'ye gitmeli (cache yok)
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    const role2 = await getProjectRole(USER_ID, PROJE_ID)
    expect(role2).toBe('staff')
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)
  })

  it('returns null on thrown exception', async () => {
    maybeSingleMock.mockRejectedValueOnce(new Error('network'))
    const role = await getProjectRole(USER_ID, PROJE_ID)
    expect(role).toBeNull()
  })

  it('clearProjectAccessCache(userId, projeId) removes specific entry', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    clearProjectAccessCache(USER_ID, PROJE_ID)
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'viewer' }, error: null })
    const role = await getProjectRole(USER_ID, PROJE_ID)
    expect(role).toBe('viewer')
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)
  })

  it('clearProjectAccessCache(userId) wipes all entries for that user', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'viewer' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    await getProjectRole(USER_ID, OTHER_PROJE_ID)
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)

    clearProjectAccessCache(USER_ID)

    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'admin' }, error: null })
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'admin' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    await getProjectRole(USER_ID, OTHER_PROJE_ID)
    expect(maybeSingleMock).toHaveBeenCalledTimes(4)
  })

  it('clearProjectAccessCache() with no args wipes all entries', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'staff' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    await getProjectRole('other-user', PROJE_ID)
    expect(maybeSingleMock).toHaveBeenCalledTimes(2)

    clearProjectAccessCache()

    maybeSingleMock.mockResolvedValueOnce({ data: { rol: 'viewer' }, error: null })
    await getProjectRole(USER_ID, PROJE_ID)
    expect(maybeSingleMock).toHaveBeenCalledTimes(3)
  })
})
