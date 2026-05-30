// Integration smoke test for RBAC (Sprint H/I) + Project Isolation (Faz 1)
//
// Mock'lı yaklaşım: gerçek Supabase Auth ve service-role çağrılarını mock'layıp
// supertest ile Express app üzerinden HTTP-level isteği test eder. Three users
// (anon, staff, admin) × kritik endpoint kategorileri:
//   - admin-only mutate (DELETE /api/faturalar/:id — silme global admin'e ait)
//   - staff+ mutate (POST /api/cekler — proje düzenleyici/admin)
//   - read-only (GET /api/dashboard/ozet — viewer+).
//
// authMiddleware tamamen mock'lanır; gerçek token doğrulaması yapılmaz. Test başında
// `currentUser` set edilir, mock middleware o user'ı req'e koyar (veya yoksa 401).
// `projectAccessCache` mock'lanır — currentUser.projectRole ile davranış kontrol edilir.

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

// Sprint role-system-modernization (PR-B): partial mock — yeni helper'ları
// (normalizeProjectRole, roleSatisfies) korumak için importOriginal kullan.
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

// supabaseAdmin generic chainable mock — bkz. Sprint #I test altyapısı
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

describe('RBAC + project isolation integration smoke', () => {
  beforeEach(() => {
    currentUser = null
  })

  describe('DELETE /api/faturalar/:id (manager+ proje yetkisi)', () => {
    // Sprint role-system-modernization (PR-B): DELETE artık proje-bazlı manager+
    // gerektirir (eski "global admin only" kuralı kalktı — global rol kavramı
    // faz 3'te tamamen kaldırılacak; PR-B sonrasında global admin hâlâ owner
    // seviyesinde tüm projelere erişebilir geriye uyumluluk için).
    it('anon → 401', async () => {
      const res = await request(app).delete('/api/faturalar/abc').query({ proje_id: PROJE_ID })
      expect(res.status).toBe(401)
    })

    it('proje user (legacy viewer) → 403 (manager+ gerekir)', async () => {
      currentUser = { id: 'u-user', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).delete('/api/faturalar/abc').query({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('proje manager (legacy staff) → not 401/403', async () => {
      // PR-B normalize: legacy 'staff' → manager seviyesinde DELETE yetkisi.
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).delete('/api/faturalar/abc').query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('global admin → not 401/403 (legacy owner fallback)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).delete('/api/faturalar/abc').query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })
  })

  describe('POST /api/cekler (yazma — manager+ gerektirir)', () => {
    // Sprint user-role-readonly (2026-05-30): yazma manager+'a daraltıldı.
    // 'user' (legacy viewer) artık POST yapamaz → 403.
    it('anon → 401', async () => {
      const res = await request(app).post('/api/cekler').send({ proje_id: PROJE_ID })
      expect(res.status).toBe(401)
    })

    it('proje user (legacy viewer) → 403 (salt-okunur, yazma manager+)', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).post('/api/cekler').send({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('proje staff (legacy manager) → not 401/403', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).post('/api/cekler').send({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('global admin → not 401/403 (admin tüm projelere erişir)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/cekler').send({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('member değil → 403', async () => {
      currentUser = { id: 'u-orphan', role: 'staff', projectRole: null }
      const res = await request(app).post('/api/cekler').send({ proje_id: PROJE_ID })
      expect(res.status).toBe(403)
    })

    it('eksik proje_id → 400', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).post('/api/cekler').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/dashboard/ozet (proje viewer+ yeterli)', () => {
    it('anon → 401', async () => {
      const res = await request(app).get('/api/dashboard/ozet').query({ proje_id: PROJE_ID })
      expect(res.status).toBe(401)
    })

    it('proje viewer → not 401/403', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).get('/api/dashboard/ozet').query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('proje staff → not 401/403', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).get('/api/dashboard/ozet').query({ proje_id: PROJE_ID })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('eksik proje_id → 400', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app).get('/api/dashboard/ozet')
      expect(res.status).toBe(400)
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
