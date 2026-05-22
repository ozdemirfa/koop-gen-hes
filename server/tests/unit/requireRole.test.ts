import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../src/utils/ApiError'

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(),
  // Sprint yetkili-role-system (PR-A): requireRole artık ROLE_RANK kullanır.
  ROLE_RANK: { admin: 3, yetkili: 2, staff: 1 },
}))

import { requireRole, requireYetkili } from '../../src/middleware/requireRole'
import { getUserRole } from '../../src/middleware/roleCache'

const mockedGetUserRole = vi.mocked(getUserRole)

function makeReq(user?: { id: string }, role?: 'admin' | 'yetkili' | 'staff' | null): Request {
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

  // ---- Sprint yetkili-role-system (PR-A) -------------------------------------
  describe('yetkili role (PR-A)', () => {
    it('admin satisfies yetkili requirement (hierarchy)', async () => {
      const result = await runMiddleware(requireRole('yetkili'), makeReq({ id: 'u1' }, 'admin'))
      expect(result).toBeUndefined()
    })

    it('yetkili satisfies yetkili requirement', async () => {
      const result = await runMiddleware(requireRole('yetkili'), makeReq({ id: 'u1' }, 'yetkili'))
      expect(result).toBeUndefined()
    })

    it('staff fails yetkili requirement → 403', async () => {
      const result = await runMiddleware(requireRole('yetkili'), makeReq({ id: 'u1' }, 'staff'))
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('yetkili fails admin requirement → 403 (admin > yetkili)', async () => {
      const result = await runMiddleware(requireRole('admin'), makeReq({ id: 'u1' }, 'yetkili'))
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('yetkili satisfies staff requirement (hierarchy)', async () => {
      const result = await runMiddleware(requireRole('staff'), makeReq({ id: 'u1' }, 'yetkili'))
      expect(result).toBeUndefined()
    })
  })

  describe('requireYetkili helper', () => {
    it('admin passes', async () => {
      const result = await runMiddleware(requireYetkili, makeReq({ id: 'u1' }, 'admin'))
      expect(result).toBeUndefined()
    })

    it('yetkili passes', async () => {
      const result = await runMiddleware(requireYetkili, makeReq({ id: 'u1' }, 'yetkili'))
      expect(result).toBeUndefined()
    })

    it('staff → 403', async () => {
      const result = await runMiddleware(requireYetkili, makeReq({ id: 'u1' }, 'staff'))
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('anon (no user) → 401', async () => {
      const result = await runMiddleware(requireYetkili, makeReq())
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(401)
    })

    it('role null → 403', async () => {
      const result = await runMiddleware(requireYetkili, makeReq({ id: 'u1' }, null))
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })
  })
})
