// Integration smoke test for RBAC (Sprint H/I)
//
// Mock'lı yaklaşım: gerçek Supabase Auth ve service-role çağrılarını mock'layıp
// supertest ile Express app üzerinden HTTP-level isteği test eder. Three users
// (anon, staff, admin) × kritik endpoint kategorileri:
//   - admin-only mutate (POST /api/faturalar)
//   - staff+ mutate (POST /api/cekler)
//   - read-only (GET /api/dashboard/ozet — anon yine 401, herhangi bir role 200/200-luk).
//
// authMiddleware tamamen mock'lanır; gerçek token doğrulaması yapılmaz. Test başında
// `currentUser` set edilir, mock middleware o user'ı req'e koyar (veya yoksa 401).
// Controller'ların DB tarafındaki davranışı mock'lanmadığı için 500 dönebilir;
// test sadece "RBAC kararı doğru mu" sorgusunu yanıtlar (401/403 bekleniyorsa kontrol).

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
    authMiddleware: (req: { user?: { id: string; email?: string }; userRole?: 'admin' | 'staff' | null }, _res: unknown, next: (err?: unknown) => void) => {
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

// supabaseAdmin'i de mock'layalım — controller'lar import sırasında veya runtime'da
// supabase client'a dokunabilir; test'imiz HTTP-level olduğu için from() çağrılarına
// boş array dönüp controller'ın validation/error path'i çalışsın yeterli.
vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.insert = chain
  builder.update = chain
  builder.delete = chain
  builder.upsert = chain
  builder.eq = chain
  builder.neq = chain
  builder.in = chain
  builder.gte = chain
  builder.lte = chain
  builder.gt = chain
  builder.lt = chain
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
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

// app default export — listen test ortamında atlanır (NODE_ENV=test).
import app from '../../src/index'

describe('RBAC integration smoke', () => {
  beforeEach(() => {
    currentUser = null
  })

  describe('POST /api/faturalar (admin-only)', () => {
    it('anon → 401', async () => {
      const res = await request(app).post('/api/faturalar').send({})
      expect(res.status).toBe(401)
    })

    it('staff → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).post('/api/faturalar').send({})
      expect(res.status).toBe(403)
    })

    it('admin → not 401/403 (downstream validation/server hatası kabul)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/faturalar').send({})
      // Admin RBAC'ı geçti; validation 400 veya DB mock 500 dönebilir, ama RBAC reddi yok
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('null role → 403 (auth ok ama user_roles kaydı yok)', async () => {
      currentUser = { id: 'u-orphan', role: null }
      const res = await request(app).post('/api/faturalar').send({})
      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/cekler (staff+, hierarchical)', () => {
    it('anon → 401', async () => {
      const res = await request(app).post('/api/cekler').send({})
      expect(res.status).toBe(401)
    })

    it('staff → not 401/403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).post('/api/cekler').send({})
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('admin → not 401/403 (hierarchical: admin satisfies staff requirement)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/cekler').send({})
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('null role → 403', async () => {
      currentUser = { id: 'u-orphan', role: null }
      const res = await request(app).post('/api/cekler').send({})
      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/dashboard/ozet (read-only, auth yeterli)', () => {
    it('anon → 401', async () => {
      const res = await request(app).get('/api/dashboard/ozet')
      expect(res.status).toBe(401)
    })

    it('staff → not 401/403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).get('/api/dashboard/ozet')
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('null role → not 401/403 (read endpoint role kontrolü yapmaz)', async () => {
      currentUser = { id: 'u-orphan', role: null }
      const res = await request(app).get('/api/dashboard/ozet')
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })
  })

  describe('Unknown route → 404', () => {
    it('GET /api/nonexistent', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get('/api/nonexistent-route')
      expect(res.status).toBe(404)
    })
  })
})
