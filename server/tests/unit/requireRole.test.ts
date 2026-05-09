import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../src/utils/ApiError'

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(),
}))

import { requireRole } from '../../src/middleware/requireRole'
import { getUserRole } from '../../src/middleware/roleCache'

const mockedGetUserRole = vi.mocked(getUserRole)

function makeReq(user?: { id: string }, role?: 'admin' | 'staff' | null): Request {
  const req: Partial<Request> = { user, userRole: role }
  return req as Request
}

function runMiddleware(handler: ReturnType<typeof requireRole>, req: Request) {
  return new Promise<unknown>((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve(err)
    handler(req, {} as Response, next)
  })
}

describe('requireRole', () => {
  beforeEach(() => {
    mockedGetUserRole.mockReset()
  })

  it('returns 401 when req.user is missing', async () => {
    const result = await runMiddleware(requireRole('admin'), makeReq())
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(401)
  })

  it('passes when role admin and required admin', async () => {
    const result = await runMiddleware(requireRole('admin'), makeReq({ id: 'u1' }, 'admin'))
    expect(result).toBeUndefined()
  })

  it('returns 403 when role staff and required admin', async () => {
    const result = await runMiddleware(requireRole('admin'), makeReq({ id: 'u1' }, 'staff'))
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
  })

  it('passes when role staff and required staff', async () => {
    const result = await runMiddleware(requireRole('staff'), makeReq({ id: 'u1' }, 'staff'))
    expect(result).toBeUndefined()
  })

  it('passes hierarchical: admin satisfies staff requirement', async () => {
    const result = await runMiddleware(requireRole('staff'), makeReq({ id: 'u1' }, 'admin'))
    expect(result).toBeUndefined()
  })

  it('returns 403 when role is null', async () => {
    const result = await runMiddleware(requireRole('staff'), makeReq({ id: 'u1' }, null))
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
  })

  it('falls back to getUserRole when req.userRole is undefined', async () => {
    mockedGetUserRole.mockResolvedValueOnce('admin')
    const req = makeReq({ id: 'u1' })
    req.userRole = undefined
    const result = await runMiddleware(requireRole('admin'), req)
    expect(result).toBeUndefined()
    expect(mockedGetUserRole).toHaveBeenCalledWith('u1')
    expect(req.userRole).toBe('admin')
  })
})
