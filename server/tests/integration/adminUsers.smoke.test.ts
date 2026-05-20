// Integration smoke for admin user management (Faz 2)
//
// Mock'lı: authMiddleware + supabaseAdmin mock'lanır. Endpoint matrisi:
//   - GET /api/admin/users  (anon→401, staff→403, admin→200)
//   - POST /api/admin/users/invite  (anon→401, staff→403, admin→201)
//   - PATCH /api/admin/users/:id/role  (admin→200)
//   - DELETE /api/admin/users/:id  (admin→200)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
}

let currentUser: TestUser | null = null

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string; email?: string }; userRole?: 'admin' | 'staff' | null },
      _res: unknown,
      next: (err?: unknown) => void
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

// Sprint role-system-modernization (PR-B): partial mock.
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

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(async () => currentUser?.role ?? null),
  clearRoleCache: vi.fn(),
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
  builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
    resolve({ data: [], error: null, count: 0 })

  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: [{ id: 'u1', email: 'a@b.com', created_at: '2026-01-01', last_sign_in_at: null }] }, error: null }),
          inviteUserByEmail: async (email: string) => ({
            data: { user: { id: 'new-user-uuid', email } },
            error: null,
          }),
          deleteUser: async () => ({ data: null, error: null }),
          getUserById: async () => ({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null }),
        },
      },
    },
  }
})

import app from '../../src/index'

describe('Admin user management smoke', () => {
  beforeEach(() => {
    currentUser = null
  })

  describe('GET /api/admin/users', () => {
    it('anon → 401', async () => {
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(401)
    })

    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(403)
    })

    it('admin → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })
  })

  describe('POST /api/admin/users/invite', () => {
    const validPayload = {
      email: 'invite@test.com',
      globalRole: 'staff' as const,
      projectAssignments: [],
    }

    it('anon → 401', async () => {
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(401)
    })

    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(403)
    })

    it('admin invalid email → 400', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/admin/users/invite').send({
        ...validPayload,
        email: 'not-an-email',
      })
      expect(res.status).toBe(400)
    })

    it('admin valid invite → 201', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.email).toBe(validPayload.email)
    })
  })

  describe('PATCH /api/admin/users/:id/role', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app)
        .patch('/api/admin/users/some-uuid/role')
        .send({ role: 'admin' })
      expect(res.status).toBe(403)
    })

    it('admin invalid role → 400', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .patch('/api/admin/users/some-uuid/role')
        .send({ role: 'superuser' })
      expect(res.status).toBe(400)
    })

    it('admin valid role → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .patch('/api/admin/users/some-uuid/role')
        .send({ role: 'staff' })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /api/admin/users/:id', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).delete('/api/admin/users/some-uuid')
      expect(res.status).toBe(403)
    })

    it('admin → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).delete('/api/admin/users/some-uuid')
      expect(res.status).toBe(200)
    })
  })
})
