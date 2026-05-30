// Integration smoke test for Project Isolation (Faz 1)
//
// Senaryolar:
//   - GET /api/projeler → kullanıcının üye olduğu projeleri filtreler (admin → tümü).
//   - GET /api/banka-hesaplari/hesaplar?proje_id=X → membership olmayan kullanıcı 403.
//   - GET /api/aidatlar (proje_id'siz) → 400.
//   - POST /api/faturalar viewer rolüyle → 403; staff rolüyle geçer.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | null
  // Kullanıcının üye olduğu projeler — proje listesi filtresi için.
  memberOfProjects?: string[]
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
    getProjectRole: vi.fn(async () => currentUser?.projectRole ?? null),
    clearProjectAccessCache: vi.fn(),
  }
})

// projectGuard.getAllowedProjeIds'i mock'la — proje listesi filtre testi için
vi.mock('../../src/utils/projectGuard', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/projectGuard')>(
    '../../src/utils/projectGuard'
  )
  return {
    ...actual,
    getAllowedProjeIds: vi.fn(async () => currentUser?.memberOfProjects ?? []),
  }
})

// supabaseAdmin chainable mock. `from('projeler').select(...).order(...).in(...)`
// chain'inden `then` resolve eder. data döndürdüğümüz proje listesi — controller
// `getAllowedProjeIds` ile filtre uygulamadıysa tüm liste, uyguladıysa filtreli liste.
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

import app from '../../src/index'

const PROJE_ID = '11111111-1111-1111-1111-111111111111'

describe('Project isolation smoke', () => {
  beforeEach(() => {
    currentUser = null
  })

  describe('proje_id zorunluluğu', () => {
    it('GET /api/aidatlar without proje_id → 400', async () => {
      currentUser = { id: 'u1', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).get('/api/aidatlar')
      expect(res.status).toBe(400)
    })

    it('GET /api/banka/hesaplar without proje_id → 400', async () => {
      currentUser = { id: 'u1', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).get('/api/banka/hesaplar')
      expect(res.status).toBe(400)
    })

    it('GET /api/cari-hareketler with proje_id=null literal → 400', async () => {
      currentUser = { id: 'u1', role: 'staff', projectRole: 'staff' }
      const res = await request(app).get('/api/cari-hareketler?proje_id=null')
      expect(res.status).toBe(400)
    })
  })

  describe('proje üyelik kontrolü', () => {
    it('GET /api/faturalar (üye değil) → 403', async () => {
      currentUser = { id: 'u-orphan', role: 'staff', projectRole: null }
      const res = await request(app).get('/api/faturalar').query({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('GET /api/faturalar (viewer) → not 401/403', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).get('/api/faturalar').query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('POST /api/faturalar (viewer → user) → 403 (salt-okunur, yazma manager+)', async () => {
      // Sprint user-role-readonly (2026-05-30): 'user' (legacy viewer) salt-okunur;
      // yazma (POST/PUT) manager+ gerektirir → 403.
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).post('/api/faturalar').send({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('DELETE /api/faturalar (viewer → user) → 403 (DELETE manager+ gerektirir)', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app)
        .delete('/api/faturalar/abc')
        .query({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('POST /api/faturalar (proje staff) → not 401/403', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).post('/api/faturalar').send({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('global admin tüm projelere erişir', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .get('/api/banka/hesaplar')
        .query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
      expect(res.status).not.toBe(400)
    })
  })

  describe('GET /api/projeler üyelik filtresi', () => {
    it('anon → 401', async () => {
      const res = await request(app).get('/api/projeler')
      expect(res.status).toBe(401)
    })

    it('global admin → 200 (tüm projeler, mock empty array)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get('/api/projeler')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('üye olmayan staff → 200 boş liste', async () => {
      currentUser = { id: 'u-empty', role: 'staff', memberOfProjects: [] }
      const res = await request(app).get('/api/projeler')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual([])
    })

    it('üye staff → 200 (mock chain empty array)', async () => {
      currentUser = {
        id: 'u-member',
        role: 'staff',
        memberOfProjects: [PROJE_ID],
      }
      const res = await request(app).get('/api/projeler')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
