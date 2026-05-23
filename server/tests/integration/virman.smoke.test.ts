// Sprint 20260520-virman-feature:
// Virman (transfer) integration smoke. Auth + proje izolasyon + RPC mock'lanır.
// Endpoint matrisi:
//   - GET    /api/virmanlar?proje_id=... (viewer+)
//   - POST   /api/virmanlar              (staff+, RPC fn_create_virman_atomic)
//   - DELETE /api/virmanlar/:id?proje_id=... (staff+)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | null
}

let currentUser: TestUser | null = null
let virmanIdInDb: string | null = null
let virmanProjeIdInDb: string | null = null

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string; email?: string }; userRole?: 'admin' | 'staff' | null },
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

// Sprint role-system-modernization (PR-B): projectAccessCache yeni helper'lar
// (normalizeProjectRole, roleSatisfies, ROLE_RANK) export ediyor; partial mock
// için importOriginal kullan.
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

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(async () => currentUser?.role ?? null),
  clearRoleCache: vi.fn(),
  // Sprint yetkili-role-system (PR-A): requireRole artık ROLE_RANK kullanır.
  ROLE_RANK: { admin: 3, yetkili: 2, staff: 1 },
}))

vi.mock('../../src/config/supabase', () => {
  function createBuilder(table: string) {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.insert = chain
    builder.update = chain
    builder.delete = chain
    builder.eq = chain
    builder.gte = chain
    builder.lte = chain
    builder.order = chain
    builder.single = async () => {
      if (table === 'virmanlar' && virmanIdInDb) {
        return { data: { id: virmanIdInDb, proje_id: virmanProjeIdInDb }, error: null }
      }
      return { data: null, error: { code: 'PGRST116', message: 'Not found' } }
    }
    builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: [], error: null })
    return builder
  }

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc: async (fnName: string, _params: unknown) => {
        if (fnName === 'fn_create_virman_atomic') {
          return {
            data: {
              virman_id: 'v1111111-1111-4111-a111-111111111111',
              gider_hareket_id: 'h1111111-1111-4111-a111-111111111111',
              gelir_hareket_id: 'h2222222-2222-4222-a222-222222222222',
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    },
  }
})

import app from '../../src/index'

const PROJE_ID = 'a1111111-1111-4111-a111-111111111111'
const KAYNAK_HESAP = 'b1111111-1111-4111-a111-111111111111'
const HEDEF_HESAP = 'b2222222-2222-4222-a222-222222222222'
const VIRMAN_ID = 'c1111111-1111-4111-a111-111111111111'

describe('Virman smoke', () => {
  beforeEach(() => {
    currentUser = null
    virmanIdInDb = null
    virmanProjeIdInDb = null
  })

  describe('GET /api/virmanlar', () => {
    it('anon → 401', async () => {
      const res = await request(app).get(`/api/virmanlar?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(401)
    })

    it('viewer → 200', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).get(`/api/virmanlar?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('global admin → 200 (proje üyeliği aranmaz)', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get(`/api/virmanlar?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(200)
    })

    it('proje_id eksik → 400', async () => {
      currentUser = { id: 'u-admin', role: 'admin' }
      const res = await request(app).get('/api/virmanlar')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/virmanlar', () => {
    // PR-B: POST → user level. Legacy 'viewer' → 'user' normalize edilir; viewer
    // artık virman ekleyebilir. (Eski beklenti 403'tü; yeni davranış 201.)
    it('viewer (legacy → user) happy path → 201', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_banka',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: 1500,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(201)
    })

    it('proje üyesi olmayan → 403', async () => {
      currentUser = { id: 'u-orphan', role: 'staff', projectRole: null }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_banka',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: 1500,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(403)
    })

    it('banka_banka happy path → 201 + virman_id', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_banka',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: 2500,
          tarih: '2026-05-20',
          aciklama: 'Test virman',
        })
      expect(res.status).toBe(201)
      expect(res.body.data.virman_id).toBeDefined()
    })

    it('banka_banka aynı hesap → 400 (schema reddi)', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_banka',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: KAYNAK_HESAP,
          tutar: 100,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(400)
    })

    it('banka_nakit + hedef dolu → 400 (schema reddi)', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_nakit',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: 100,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(400)
    })

    it('nakit_banka happy path → 201', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'nakit_banka',
          kaynak_hesap_id: null,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: 500,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(201)
    })

    it('negatif tutar → 400', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      const res = await request(app)
        .post('/api/virmanlar')
        .send({
          proje_id: PROJE_ID,
          virman_tipi: 'banka_banka',
          kaynak_hesap_id: KAYNAK_HESAP,
          hedef_hesap_id: HEDEF_HESAP,
          tutar: -100,
          tarih: '2026-05-20',
        })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/virmanlar/:id (manager+ — yıkıcı)', () => {
    // PR-B: DELETE artık manager+ gerektirir. Legacy 'viewer' → user → 403;
    // legacy 'staff' → manager → geçer.
    it('viewer (user level) → 403', async () => {
      currentUser = { id: 'u-viewer', role: 'staff', projectRole: 'viewer' }
      const res = await request(app).delete(`/api/virmanlar/${VIRMAN_ID}?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(403)
    })

    it('staff (legacy → manager) + var olmayan id → 404', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      virmanIdInDb = null
      const res = await request(app).delete(`/api/virmanlar/${VIRMAN_ID}?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(404)
    })

    it('manager + farklı proje virmanı → 404 (defense in depth)', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      virmanIdInDb = VIRMAN_ID
      virmanProjeIdInDb = 'a9999999-9999-4999-a999-999999999999'
      const res = await request(app).delete(`/api/virmanlar/${VIRMAN_ID}?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(404)
    })

    it('manager + same proje → 200', async () => {
      currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
      virmanIdInDb = VIRMAN_ID
      virmanProjeIdInDb = PROJE_ID
      const res = await request(app).delete(`/api/virmanlar/${VIRMAN_ID}?proje_id=${PROJE_ID}`)
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
    })
  })
})
