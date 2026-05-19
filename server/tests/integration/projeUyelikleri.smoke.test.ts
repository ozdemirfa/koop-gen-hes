// Integration smoke for project membership management (Faz 2)
//
// Mock'lı: authMiddleware + supabaseAdmin mock'lanır. Endpoint matrisi:
//   - GET    /api/projeler/:projeId/uyeler/me  (any user → kendi rolünü görür)
//   - GET    /api/projeler/:projeId/uyeler     (admin only)
//   - POST   /api/projeler/:projeId/uyeler     (admin only)
//   - PATCH  /api/projeler/:projeId/uyeler/:userId  (admin only)
//   - DELETE /api/projeler/:projeId/uyeler/:userId  (admin only)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | null
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

vi.mock('../../src/middleware/projectAccessCache', () => ({
  getProjectRole: vi.fn(async () => currentUser?.projectRole ?? null),
  clearProjectAccessCache: vi.fn(),
}))

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
  builder.single = async () => ({ data: { user_id: 'u-target', proje_id: 'p1', rol: 'staff' }, error: null })
  builder.maybeSingle = async () => ({ data: { rol: 'staff' }, error: null })
  builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
    resolve({ data: [], error: null, count: 0 })

  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { id: 'u-target', email: 't@b.com' } }, error: null }),
        },
      },
    },
  }
})

import app from '../../src/index'

// Zod v4 strict UUID — v4 format required (third group başlar 4-, fourth group 8/9/a/b ile)
const PROJE_ID = 'a1111111-1111-4111-a111-111111111111'
const TARGET_USER_ID = 'a2222222-2222-4222-a222-222222222222'

describe('Project membership smoke', () => {
  beforeEach(() => {
    currentUser = null
  })

  describe('GET /api/projeler/:projeId/uyeler/me (self role)', () => {
    it('anon → 401', async () => {
      const res = await request(app).get(`/api/projeler/${PROJE_ID}/uyeler/me`)
      expect(res.status).toBe(401)
    })

    it('global admin → 200 ve rol=admin', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get(`/api/projeler/${PROJE_ID}/uyeler/me`)
      expect(res.status).toBe(200)
      expect(res.body.data.rol).toBe('admin')
    })

    it('staff (proje üyesi) → 200 ve DB rolü', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).get(`/api/projeler/${PROJE_ID}/uyeler/me`)
      expect(res.status).toBe(200)
      // Mock maybeSingle staff döner
      expect(res.body.data.rol).toBe('staff')
    })
  })

  describe('GET /api/projeler/:projeId/uyeler (member list)', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).get(`/api/projeler/${PROJE_ID}/uyeler`)
      expect(res.status).toBe(403)
    })

    it('admin → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get(`/api/projeler/${PROJE_ID}/uyeler`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /api/projeler/:projeId/uyeler', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app)
        .post(`/api/projeler/${PROJE_ID}/uyeler`)
        .send({ user_id: TARGET_USER_ID, rol: 'staff' })
      expect(res.status).toBe(403)
    })

    it('admin invalid rol → 400', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .post(`/api/projeler/${PROJE_ID}/uyeler`)
        .send({ user_id: TARGET_USER_ID, rol: 'superuser' })
      expect(res.status).toBe(400)
    })

    it('admin valid → 201', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .post(`/api/projeler/${PROJE_ID}/uyeler`)
        .send({ user_id: TARGET_USER_ID, rol: 'staff' })
      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /api/projeler/:projeId/uyeler/:userId (rol update)', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app)
        .patch(`/api/projeler/${PROJE_ID}/uyeler/${TARGET_USER_ID}`)
        .send({ rol: 'viewer' })
      expect(res.status).toBe(403)
    })

    it('admin valid → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .patch(`/api/projeler/${PROJE_ID}/uyeler/${TARGET_USER_ID}`)
        .send({ rol: 'viewer' })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /api/projeler/:projeId/uyeler/:userId', () => {
    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).delete(`/api/projeler/${PROJE_ID}/uyeler/${TARGET_USER_ID}`)
      expect(res.status).toBe(403)
    })

    it('admin → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).delete(`/api/projeler/${PROJE_ID}/uyeler/${TARGET_USER_ID}`)
      expect(res.status).toBe(200)
    })
  })
})
