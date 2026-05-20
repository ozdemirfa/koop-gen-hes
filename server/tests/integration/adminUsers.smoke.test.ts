// Integration smoke for admin user management.
//
// Sprint role-system-modernization (PR-D, 2026-05-20):
//   - Davet endpoint'i artık proje-bazlı: requireProjectAccess('owner') guard'ı
//     body.projeId üzerinden çalışır. Payload: { email, projeId, projectRole }.
//   - PATCH /users/:id/role 410 (Gone) döner — global rol değiştirme kaldırıldı.
//   - Yeni: POST /api/admin/users/:id/sifre-yenile — owner-only.
//   - GET /users + DELETE /users/:id legacy global admin akışıyla devam eder.
//
// Mock'lı: authMiddleware + projectAccessCache + supabaseAdmin mock'lanır.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
}

let currentUser: TestUser | null = null
let mockProjectRole: 'owner' | 'manager' | 'user' | null = null

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

vi.mock('../../src/middleware/projectAccessCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/middleware/projectAccessCache')>(
    '../../src/middleware/projectAccessCache',
  )
  return {
    ...actual,
    getProjectRole: vi.fn(async () => mockProjectRole),
    clearProjectAccessCache: vi.fn(),
  }
})

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(async () => currentUser?.role ?? null),
  clearRoleCache: vi.fn(),
}))

vi.mock('../../src/config/supabase', () => {
  let mockMembershipRole: string | null = null

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
  builder.maybeSingle = async () => {
    // PasswordResetService membership lookup için — proje üyeliği
    if (mockMembershipRole === null) return { data: null, error: null }
    return { data: { rol: mockMembershipRole }, error: null }
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
    resolve({ data: [], error: null, count: 0 })

  // Test'lerin membershipRole'u set edebilmesi için global hook
  // @ts-expect-error global hook
  global.__setMockMembershipRole = (role: string | null) => {
    mockMembershipRole = role
  }

  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [{ id: 'u1', email: 'a@b.com', created_at: '2026-01-01', last_sign_in_at: null }],
            },
            error: null,
          }),
          inviteUserByEmail: async (email: string) => ({
            data: { user: { id: 'new-user-uuid', email } },
            error: null,
          }),
          deleteUser: async () => ({ data: null, error: null }),
          getUserById: async () => ({ data: { user: { id: 'u-target', email: 'target@b.com' } }, error: null }),
          updateUserById: async () => ({ data: { user: { id: 'u-target' } }, error: null }),
        },
      },
    },
  }
})

import app from '../../src/index'

// Geçerli bir v4-uyumlu UUID (Zod v4 strict UUID pattern: version=4, variant=8/9/a/b)
const PROJE_ID = '11111111-1111-4111-8111-111111111111'

describe('Admin user management smoke (PR-D)', () => {
  beforeEach(() => {
    currentUser = null
    mockProjectRole = null
    // @ts-expect-error global hook
    if (typeof global.__setMockMembershipRole === 'function') global.__setMockMembershipRole(null)
  })

  describe('GET /api/admin/users (legacy global admin)', () => {
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

  describe('POST /api/admin/users/invite (proje-bazlı, owner-only)', () => {
    const validPayload = {
      email: 'invite@test.com',
      projeId: PROJE_ID,
      projectRole: 'user' as const,
    }

    it('anon → 401', async () => {
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(401)
    })

    it('schema: legacy globalRole/projectAssignments payload → 400 (projeId yok)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      mockProjectRole = 'owner'
      const res = await request(app).post('/api/admin/users/invite').send({
        email: 'invite@test.com',
        globalRole: 'staff',
        projectAssignments: [],
      })
      expect(res.status).toBe(400)
    })

    it('schema: invalid email → 400', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      mockProjectRole = 'owner'
      const res = await request(app).post('/api/admin/users/invite').send({
        ...validPayload,
        email: 'not-an-email',
      })
      expect(res.status).toBe(400)
    })

    it('schema: projectRole owner → 400 (sadece manager/user kabul edilir)', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      const res = await request(app).post('/api/admin/users/invite').send({
        ...validPayload,
        projectRole: 'owner',
      })
      expect(res.status).toBe(400)
    })

    it('manager → 403 (sadece owner davet edebilir)', async () => {
      currentUser = { id: 'u-mgr', role: 'staff' }
      mockProjectRole = 'manager'
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(403)
    })

    it('user → 403', async () => {
      currentUser = { id: 'u-usr', role: 'staff' }
      mockProjectRole = 'user'
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(403)
    })

    it('owner valid invite → 201', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.email).toBe(validPayload.email)
      expect(res.body.data.project_role).toBe('user')
    })

    it('legacy global admin owner gibi davranır → 201', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      // global admin requireProjectAccess'te otomatik owner sayılır
      const res = await request(app).post('/api/admin/users/invite').send(validPayload)
      expect(res.status).toBe(201)
    })
  })

  describe('POST /api/admin/users/:id/sifre-yenile (PR-D, owner-only)', () => {
    const TARGET_USER = 'u-target'
    const validBody = { projeId: PROJE_ID }

    it('anon → 401', async () => {
      const res = await request(app).post(`/api/admin/users/${TARGET_USER}/sifre-yenile`).send(validBody)
      expect(res.status).toBe(401)
    })

    it('manager → 403', async () => {
      currentUser = { id: 'u-mgr', role: 'staff' }
      mockProjectRole = 'manager'
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(403)
    })

    it('user → 403', async () => {
      currentUser = { id: 'u-usr', role: 'staff' }
      mockProjectRole = 'user'
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(403)
    })

    it('owner caller=target → 403 (self-yasak)', async () => {
      currentUser = { id: TARGET_USER, role: 'staff' }
      mockProjectRole = 'owner'
      // @ts-expect-error global hook
      global.__setMockMembershipRole('user')
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(403)
    })

    it('owner target üye değil → 400', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      // membership lookup null döner
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(400)
    })

    it('owner target owner → 403', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      // @ts-expect-error global hook
      global.__setMockMembershipRole('owner')
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(403)
    })

    it('owner valid + auto password → 200 generated=true, 16 char', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      // @ts-expect-error global hook
      global.__setMockMembershipRole('user')
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send(validBody)
      expect(res.status).toBe(200)
      expect(res.body.data.generated).toBe(true)
      expect(res.body.data.password).toHaveLength(16)
    })

    it('owner valid + custom password → 200 generated=false', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      // @ts-expect-error global hook
      global.__setMockMembershipRole('manager')
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send({ projeId: PROJE_ID, newPassword: 'SecurePass123!' })
      expect(res.status).toBe(200)
      expect(res.body.data.generated).toBe(false)
      expect(res.body.data.password).toBe('SecurePass123!')
    })

    it('owner short password → 400', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      mockProjectRole = 'owner'
      const res = await request(app)
        .post(`/api/admin/users/${TARGET_USER}/sifre-yenile`)
        .send({ projeId: PROJE_ID, newPassword: 'abc' })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/admin/users/:id/role (deprecated → 410)', () => {
    it('admin → 410 Gone', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .patch('/api/admin/users/some-uuid/role')
        .send({ role: 'admin' })
      expect(res.status).toBe(410)
    })
  })

  describe('DELETE /api/admin/users/:id (legacy global admin)', () => {
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
