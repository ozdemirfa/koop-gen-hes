// Sprint qa-review-bugfix-faz3 (2026-05-25, P0 #1):
// /api/settings/birimler ve /api/settings/pozlar route'ları önceden
// `routes/index.ts:58-64`'te guard'sız inline tanımlıydı — tüm authenticated
// kullanıcılar (user/viewer dahil) global birim/poz oluşturup silebiliyordu.
// settings.routes.ts (guard'lı) mount edildi:
//   - POST  : requireCreateGlobalDefsIfGlobal (is_global=true ise admin/yetkili/manager)
//   - PUT   : service-side ownership-or-admin
//   - DELETE: service-side ownership-or-admin
//
// Sprint birim-poz-user-scope (2026-05-27 update):
//   Hibrit model — kişisel kayıtlar tüm authenticated'a açık (default is_global=false).
//   Global ekleme (is_global=true) için requireCreateGlobalDefs guard tetiklenir.
//   PUT/DELETE'te artık admin-only değil; service katmanı admin OR sahibi kontrolü yapar.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'yetkili' | 'staff' | null
}

let currentUser: TestUser | null = null
let projectMembership: { user_id: string; rol: string }[] = []
// Birim/poz ownership stub — service.assertOwnershipOrAdmin için
let ownerLookup: { kullanici_id: string | null } | null = null

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
// sorgusu için projectMembership state'ini döndürür; service ownership lookup
// için ownerLookup state'ini döndürür; controller insert/delete için generic
// no-op döner.
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
  builder.or = chain
  builder.order = chain
  builder.range = chain
  builder.limit = chain
  builder.single = async () => ({ data: null, error: null })
  builder.maybeSingle = async () => {
    if (lastTable.name === 'proje_uyelikleri') {
      const hit = projectMembership.find((m) => ['owner', 'manager'].includes(m.rol))
      return { data: hit ?? null, error: null }
    }
    if (lastTable.name === 'birimler' || lastTable.name === 'pozlar') {
      return { data: ownerLookup, error: null }
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

describe('Settings guard smoke (P0 fix + user-scope)', () => {
  beforeEach(() => {
    currentUser = null
    projectMembership = []
    ownerLookup = null
  })

  describe('POST /api/settings/birimler — kişisel ekleme her authenticated\'a açık', () => {
    it('anon → 401', async () => {
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm2' })
      expect(res.status).toBe(401)
    })

    it('staff kişisel (is_global yok) → 201', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'Paket' })
      expect(res.status).toBe(201)
    })

    it('staff kişisel (is_global=false explicit) → 201', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'Paket', is_global: false })
      expect(res.status).toBe(201)
    })
  })

  describe('POST /api/settings/birimler — global ekleme yetki gerektirir', () => {
    it('staff (proje üyeliği yok) global ekleme → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      projectMembership = []
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'GlobalUnit', is_global: true })
      expect(res.status).toBe(403)
    })

    it('admin global → 201', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm2', is_global: true })
      expect(res.status).toBe(201)
    })

    it('yetkili global → 201', async () => {
      currentUser = { id: 'u-yetkili', role: 'yetkili' }
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm3', is_global: true })
      expect(res.status).toBe(201)
    })

    it('staff + proje owner global → 201', async () => {
      currentUser = { id: 'u-owner', role: 'staff' }
      projectMembership = [{ user_id: 'u-owner', rol: 'owner' }]
      const res = await request(app).post('/api/settings/birimler').send({ ad: 'm4', is_global: true })
      expect(res.status).toBe(201)
    })
  })

  describe('DELETE /api/settings/birimler/:id — admin OR sahibi', () => {
    it('anon → 401', async () => {
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(401)
    })

    it('non-admin başka sahibin kaydı → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      ownerLookup = { kullanici_id: 'someone-else' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(403)
    })

    it('non-admin global (kullanici_id NULL) → 403', async () => {
      currentUser = { id: 'u-staff', role: 'staff' }
      ownerLookup = { kullanici_id: null }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(403)
    })

    it('non-admin kendi kaydı → 200', async () => {
      currentUser = { id: 'u-owner-self', role: 'staff' }
      ownerLookup = { kullanici_id: 'u-owner-self' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(200)
    })

    it('admin global → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      ownerLookup = { kullanici_id: null }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(200)
    })

    it('admin başkasının kişisel kaydı → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      ownerLookup = { kullanici_id: 'someone-else' }
      const res = await request(app).delete('/api/settings/birimler/abc')
      expect(res.status).toBe(200)
    })
  })

  describe('PUT /api/settings/pozlar/:id — admin OR sahibi', () => {
    it('non-admin başka kayıt → 403', async () => {
      currentUser = { id: 'u-yetkili', role: 'yetkili' }
      ownerLookup = { kullanici_id: 'someone-else' }
      const res = await request(app)
        .put('/api/settings/pozlar/abc')
        .send({ poz_no: 'P-1', tanim: 'Yeni Poz' })
      expect(res.status).toBe(403)
    })

    it('non-admin kendi kayıt → 200', async () => {
      currentUser = { id: 'u-self', role: 'staff' }
      ownerLookup = { kullanici_id: 'u-self' }
      const res = await request(app)
        .put('/api/settings/pozlar/abc')
        .send({ poz_no: 'P-1', tanim: 'Yeni Poz' })
      expect(res.status).toBe(200)
    })

    it('admin global → 200', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      ownerLookup = { kullanici_id: null }
      const res = await request(app)
        .put('/api/settings/pozlar/abc')
        .send({ poz_no: 'P-1', tanim: 'Yeni Poz' })
      expect(res.status).toBe(200)
    })
  })
})
