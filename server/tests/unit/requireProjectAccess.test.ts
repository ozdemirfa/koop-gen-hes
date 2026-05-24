import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../src/utils/ApiError'

// Sprint role-system-modernization (PR-B): yeni 3-rol modeli — owner/manager/user.
// Legacy rol değerleri (admin/staff/viewer) geriye uyumluluk için tanınmaya devam
// eder ve şu şekilde map edilir:
//   viewer → user, staff → user (PR-B sonrasında form girişi user'a açıldı),
//   admin (per-project) → owner.

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(),
}))

vi.mock('../../src/middleware/projectAccessCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/middleware/projectAccessCache')>(
    '../../src/middleware/projectAccessCache'
  )
  return {
    ...actual,
    getProjectRole: vi.fn(),
    clearProjectAccessCache: vi.fn(),
  }
})

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
  baseUrl?: string
}

function makeReq(input: ReqInput = {}): Request {
  const req: Partial<Request> = {
    user: input.user,
    userRole: input.userRole,
    body: input.body ?? {},
    query: input.query ?? ({} as any),
    params: input.params ?? {},
    baseUrl: input.baseUrl ?? '',
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
    const result = await runMiddleware(requireProjectAccess('user'), makeReq({ body: { proje_id: PROJE_ID } }))
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(401)
  })

  it('returns 400 when proje_id is missing entirely', async () => {
    const result = await runMiddleware(
      requireProjectAccess('user'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff' })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(400)
    expect((result as ApiError).message).toMatch(/proje_id/i)
  })

  it('returns 400 when proje_id is literal "null"', async () => {
    const result = await runMiddleware(
      requireProjectAccess('user'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: 'null' } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(400)
  })

  it('global admin always passes regardless of membership (legacy → owner)', async () => {
    const req = makeReq({ user: { id: 'u1' }, userRole: 'admin', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('manager'), req)
    expect(result).toBeUndefined()
    // Legacy davranış: global admin → owner seviyesi (faz 3'te kaldırılacak).
    expect(req.projectRole).toBe('owner')
    expect(mockedGetProjectRole).not.toHaveBeenCalled()
  })

  it('returns 403 when user is not a project member', async () => {
    mockedGetProjectRole.mockResolvedValueOnce(null)
    const result = await runMiddleware(
      requireProjectAccess('user'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
    expect((result as ApiError).message).toMatch(/eri.+yok/i)
  })

  // === Yeni 3-rol modeli ===

  it('user role passes for minRole=user', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('user')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('user'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('user')
  })

  it('user is rejected when minRole=manager', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('user')
    const result = await runMiddleware(
      requireProjectAccess('manager'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
    expect((result as ApiError).message).toMatch(/y.+netici|manager/i)
  })

  it('manager passes for minRole=manager', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('manager')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('manager'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('manager')
  })

  it('owner passes for minRole=manager (hierarchical)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('owner')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('manager'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('owner')
  })

  it('manager is rejected when minRole=owner', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('manager')
    const result = await runMiddleware(
      requireProjectAccess('owner'),
      makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    )
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(403)
    expect((result as ApiError).message).toMatch(/sahib|owner/i)
  })

  it('owner passes for minRole=owner', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('owner')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('owner'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('owner')
  })

  // === Legacy backward-compat ===

  it('legacy viewer alias → user level (min=viewer)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('viewer')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', query: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('viewer'), req)
    expect(result).toBeUndefined()
    // Normalize edilmiş hali req.projectRole'a yazılır
    expect(req.projectRole).toBe('user')
  })

  it('legacy staff alias → user level (min=staff aslında user gerektirir)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('staff')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    // staff → manager normalize edilir
    expect(req.projectRole).toBe('manager')
  })

  it('legacy admin (per-project) → owner level (min=staff)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('admin')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', body: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('staff'), req)
    expect(result).toBeUndefined()
    expect(req.projectRole).toBe('owner')
  })

  it('falls back to getUserRole when req.userRole is undefined', async () => {
    mockedGetUserRole.mockResolvedValueOnce('admin')
    const req = makeReq({ user: { id: 'u1' }, query: { proje_id: PROJE_ID } })
    req.userRole = undefined
    const result = await runMiddleware(requireProjectAccess('manager'), req)
    expect(result).toBeUndefined()
    expect(mockedGetUserRole).toHaveBeenCalledWith('u1')
    // Global admin → owner seviyesi
    expect(req.projectRole).toBe('owner')
  })

  it('reads proje_id from req.params.projeId when body/query empty', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('user')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', params: { projeId: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('user'), req)
    expect(result).toBeUndefined()
  })

  it('reads proje_id from req.params.id ONLY on /projeler mount (proje-anchor)', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('user')
    const req = makeReq({
      user: { id: 'u1' },
      userRole: 'staff',
      params: { id: PROJE_ID },
      baseUrl: '/api/projeler',
    })
    const result = await runMiddleware(requireProjectAccess('user'), req)
    expect(result).toBeUndefined()
  })

  it('does NOT use req.params.id fallback on sub-resource routes (e.g. /uyeler/:id) → 400', async () => {
    // Regression: `/uyeler/:id` rotasında `:id` üye UUID'sidir; proje_id sanılırsa
    // 403 "Bu projeye erişiminiz yok" döner — beklenen davranış net 400.
    const req = makeReq({
      user: { id: 'u1' },
      userRole: 'staff',
      params: { id: PROJE_ID },
      baseUrl: '/api/uyeler',
    })
    const result = await runMiddleware(requireProjectAccess('user'), req)
    expect(result).toBeInstanceOf(ApiError)
    expect((result as ApiError).statusCode).toBe(400)
    expect((result as ApiError).message).toMatch(/proje_id/i)
    expect(mockedGetProjectRole).not.toHaveBeenCalled()
  })

  it('reads proje_id from req.params.proje_id (snake_case) as fallback', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('user')
    const req = makeReq({ user: { id: 'u1' }, userRole: 'staff', params: { proje_id: PROJE_ID } })
    const result = await runMiddleware(requireProjectAccess('user'), req)
    expect(result).toBeUndefined()
  })

  it('body proje_id takes precedence over query', async () => {
    mockedGetProjectRole.mockResolvedValueOnce('manager')
    const req = makeReq({
      user: { id: 'u1' },
      userRole: 'staff',
      body: { proje_id: PROJE_ID },
      query: { proje_id: '22222222-2222-2222-2222-222222222222' },
    })
    await runMiddleware(requireProjectAccess('manager'), req)
    expect(mockedGetProjectRole).toHaveBeenCalledWith('u1', PROJE_ID)
  })
})
