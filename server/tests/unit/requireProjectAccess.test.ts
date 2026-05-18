import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../src/utils/ApiError'

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(),
}))

vi.mock('../../src/middleware/projectAccessCache', () => ({
  getProjectRole: vi.fn(),
  clearProjectAccessCache: vi.fn(),
}))

import { requireProjectAccess } from '../../src/middleware/requireProjectAccess'
import { getUserRole } from '../../src/middleware/roleCache'
import { getProjectRole } from '../../src/middleware/projectAccessCache'

const mockedGetUserRole = vi.mocked(getUserRole)
const mockedGetProjectRole = vi.mocked(getProjectRole)

interface ReqInput {
  user?: { id: string }
  userRole?: 'admin' | 'staff' | null
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  params?: Record<string, string>
}

function makeReq(input: ReqInput = {}): Request {
  const req: Partial<Request> = {
    user: input.user,
    userRole: input.userRole,
    body: input.body ?? {},
    query: input.query ?? ({} as any),
    params: input.params ?? {},
  }
  return req as Request
}

function runMiddleware(handler: ReturnType<typeof requireProjectAccess>, req: Request) {
  return new Promise<unknown>((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve(err)
    handler(req, {} as Response, next)
  })
}

const PROJE_ID = '11111111-1111-1111-1111-111111111111'

describe('requireProjectAccess', () => {
  beforeEach(() => {
    mockedGetUserRole.mockReset()
    mockedGetProjectRole.mockReset()
  })

  it('returns 401 when req.user is missing', async () => {
    const result = await runMiddleware(requireProjectAccess('viewer'), makeReq({ body: { proje_id: PROJE_ID } }))
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(401)
  })

  it('returns 400 when proje_id is missing entirely', async () => {
    const result = await runMiddleware(
      requireProjectAccess('viewer'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff' })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(400)
    expect((result as ApiError).message).toMatch(/proje_id/i)
  })

  it('returns 400 when proje_id is literal "null"', async () => {
    const result = await runMiddleware(
      requireProjectAccess('viewer'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: 'null' } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(400)
  })

  it('global admin always passes regardless of membership', async () => {
    const req = makeReq({ user: { id: 'u1' }, userRole: 'admin', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('admin')
    expect(mockedGetProjectRole).not.toHaveBeenCalled()
  })

  it('returns 403 when user is not a project member', async () => {
    mockedGetProjectRole.mockResolvedValueOnce(null)
    const result = await runMiddleware(
      requireProjectAccess('viewer'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
    expect((result as ApiError).message).toMatch(/eri.+yok/i)
  })

  it('viewer role passes for minRole=viewer', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('viewer')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('viewer'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('viewer')
  })

  it('viewer is rejected when minRole=staff', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('viewer')
    const result = await runMiddleware(
      requireProjectAccess('staff'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
    expect((result as ApiError).message).toMatch(/d.+zenle.+yetki/i)
  })

  it('staff role passes for minRole=staff', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('staff')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('staff')
  })

  it('project-admin role passes for minRole=staff (hierarchical)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('admin')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('admin')
  })

  it('falls back to getUserRole when req.userRole is undefined', async () => {
    mockedGetUserRole.mockResolvedValueOnce('admin')
    const req = makeReq({ user: { id: 'u1' }, query: { proje_id: PROJE_ID } })
    req.userRole = undefined
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    expect(mockedGetUserRole).toHaveBeenCalledWith('u1')
    expect(req.projectRole).toBe('admin')
  })

  it('reads proje_id from req.params.projeId when body/query empty', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('viewer')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', params: { projeId: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('viewer'), req)
    expect(result).toBeUndefined()
  })

  it('reads proje_id from req.params.id as last resort', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('viewer')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', params: { id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('viewer'), req)
    expect(result).toBeUndefined()
  })

  it('body proje_id takes precedence over query', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('staff')
    const req = makeReq({
      user: { id: 'u1' },
      userRole: 'staff',
      body: { proje_id: PROJE_ID },
      query: { proje_id: '22222222-2222-2222-2222-222222222222' },
    })
    await runMiddleware(requireProjectAccess('staff'), req)
    expect(mockedGetProjectRole).toHaveBeenCalledWith('u1', PROJE_ID)
  })
})
