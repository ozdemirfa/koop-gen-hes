// Sprint qa-review-bugfix-faz3 (2026-05-25, P0 #1):
// /api/settings/birimler ve /api/settings/pozlar route'ları önceden
// `routes/index.ts:58-64`'te guard'sız inline tanımlıydı — tüm authenticated
// kullanıcılar (user/viewer dahil) global birim/poz oluşturup silebiliyordu.
// settings.routes.ts (guard'lı) mount edildi:
//   - POST  : requireCreateGlobalDefs (admin / yetkili / herhangi proje owner-manager)
//   - PUT   : requireRole('admin')
//   - DELETE: requireRole('admin')
//
// Bu smoke test guard'ın yerleştiğini ve regresyon olmadığını doğrular.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'yetkili' | 'staff' | null
}

let currentUser: TestUser | null = null
let projectMembership: { user_id: string; rol: string }[] = []

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string; email?: string }; userRole?: 'admin' | 'yetkili' | 'staff' | null },
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

// supabaseAdmin generic chainable mock — requireCreateGlobalDefs proje_uyelikleri
// sorgusu için projectMembership state'ini döndürür; controller insert/delete
// için generic no-op döner.
vi.mock('../../src/config/supabase', () => {
  const lastTable = { name: '' }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.insert = (rows: unknown) => {
    return {
      ...builder,
      select: () => ({
        single: async () => ({ data: Array.isArray(rows) ? rows[0] : rows, error: null }),
        maybeSingle: async () => ({ data: Array.isArray(rows) ? rows[0] : rows, error: null }),
        then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve({ data: Array.isArray(rows) ? rows : [rows], error: null }),
      }),
      then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
        resolve({ data: Array.isArray(rows) ? rows : [rows], error: null }),
    }
  }
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
  builder.maybeSingle = async () => {
    if (lastTable.name === 'proje_uyelikleri') {
      const hit = projectMembership.find((m) => ['owner', 'manager'].includes(m.rol))
      return { data: hit ?? null, error: null }
    }
    return { data: null, error: null }
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
    resolve({ data: [], error: null, count: 0 })
  return {
    supabaseAdmin: {
      from: (table: string) => {
        lastTable.name = table
        return builder
      },
      rpc: async () => ({ data: null, error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

import app from '../../src/index'

describe('Settings guard smoke (P0 fix)', () => {
  beforeEach(() => {
    currentUser = null
    projectMembership = []
  })

  describe('POST /api/settings/birimler — requireCreateGlobalDefs', () => {
    it('anon → 401', async () => {
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm2' })
      expect(res.status).toBe(401)
    })

    it('staff (proje üyeliği yok) → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      projectMembership = []
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm2' })
      expect(res.status).toBe(403)
    })

    it('admin → 201', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm2' })
      expect(res.status).toBe(201)
    })

    it('yetkili → 201', async () => {
      currentUser = { id: 'u-yetkili', role: 'yetkili' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm3' })
      expect(res.status).toBe(201)
    })

    it('staff + proje owner → 201', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      projectMembership = [{ user_id: 'u-owner', rol: 'owner' }]
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm4' })
      expect(res.status).toBe(201)
    })
  })

  describe('DELETE /api/settings/birimler/:id — requireRole(admin)', () => {
    it('anon → 401', async () => {
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(401)
    })

    it('staff → 403 (admin-only)', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(403)
    })

    it('yetkili → 403 (admin-only)', async () => {
      currentUser = { id: 'u-yetkili', role: 'yetkili' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(403)
    })

    it('admin → not 401/403', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })
  })

  describe('PUT /api/settings/pozlar/:id — requireRole(admin)', () => {
    it('yetkili → 403', async () => {
      currentUser = { id: 'u-yetkili', role: 'yetkili' }
      const res = await request(app)
        .put('/api/settings/pozlar/abc')
        .send({ poz_no: 'P-1', tanim: 'Yeni Poz' })
      expect(res.status).toBe(403)
    })

    it('admin → not 401/403', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app)
        .put('/api/settings/pozlar/abc')
        .send({ poz_no: 'P-1', tanim: 'Yeni Poz' })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })
  })
})
