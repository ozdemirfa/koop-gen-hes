/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 * POST /api/projeler — requireYetkili middleware testleri.
 *
 * Bu test HTTP layer'a karşı çalışır; auth + roleCache + supabaseAdmin mock'lanır.
 * RLS politikası (projeler_insert: is_yetkili()) middleware ile in-depth defense
 * sağlıyor. Burada middleware'in 403/201 davranışını doğruluyoruz.
 *
 * Mock pattern: adminUsers.smoke.test.ts ile aynı şekilde authMiddleware override.
 * Bu test env-bağımsız — hep koşar.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'yetkili' | 'staff' | null
}

let currentUser: TestUser | null = null

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string; email?: string }; userRole?: 'admin' | 'yetkili' | 'staff' | null },
      _res: unknown,
      next: (err?: unknown) => void,
    ) => {
      if (!currentUser) {
        next(ApiError.unauthorized('Bearer token gerekli'))
        return
      }
      req.user = { id: currentUser.id, email: currentUser.email }
      req.userRole = currentUser.role
      next()
    },
  }
})

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(async () => currentUser?.role ?? null),
  clearRoleCache: vi.fn(),
  ROLE_RANK: { admin: 3, yetkili: 2, staff: 1 },
}))

vi.mock('../../src/middleware/projectAccessCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/middleware/projectAccessCache')>(
    '../../src/middleware/projectAccessCache',
  )
  return {
    ...actual,
    getProjectRole: vi.fn(async () => null),
    clearProjectAccessCache: vi.fn(),
  }
})

vi.mock('../../src/services/proje.service', () => ({
  projeService: {
    list: async () => [],
    create: async (body: any, userId?: string) => ({
      id: 'new-proje-id',
      ...body,
      owner_user_id: userId,
    }),
  },
}))

vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.insert = chain
  builder.update = chain
  builder.delete = chain
  builder.upsert = chain
  builder.eq = chain
  builder.in = chain
  builder.order = chain
  builder.range = chain
  builder.limit = chain
  builder.single = async () => ({ data: null, error: null })
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.then = (resolve: any) => resolve({ data: [], error: null, count: 0 })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async () => ({ data: null, error: null }),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    },
  }
})

import app from '../../src/index'

const validProjeBody = {
  proje_adi: 'Test Projesi',
}

describe('POST /api/projeler — requireYetkili (PR-A)', () => {
  beforeEach(() => {
    currentUser = null
  })

  it('anon → 401', async () => {
    const res = await request(app).post('/api/projeler').send(validProjeBody)
    expect(res.status).toBe(401)
  })

  it('staff → 403', async () => {
    currentUser = { id: 'u-staff', role: 'staff' }
    const res = await request(app).post('/api/projeler').send(validProjeBody)
    expect(res.status).toBe(403)
  })

  it('role null → 403', async () => {
    currentUser = { id: 'u-nullrole', role: null }
    const res = await request(app).post('/api/projeler').send(validProjeBody)
    expect(res.status).toBe(403)
  })

  it('yetkili → 201', async () => {
    currentUser = { id: 'u-yet', role: 'yetkili' }
    const res = await request(app).post('/api/projeler').send(validProjeBody)
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe('new-proje-id')
  })

  it('admin → 201 (hierarchy)', async () => {
    currentUser = { id: 'u-adm', role: 'admin' }
    const res = await request(app).post('/api/projeler').send(validProjeBody)
    expect(res.status).toBe(201)
  })
})
