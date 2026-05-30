// Sprint qa-review-bugfix-faz3 (2026-05-25, P0 #3):
// POST /api/projeler/yillik-plan-kalemleri/bulk önceden Zod validation YOK
// + raw `req.body.kalemler` doğrudan supabaseAdmin.upsert'e geçiyordu.
// Şimdi `yillikPlanKalemleriBulkSchema` ile her kalem valide ediliyor,
// ek olarak controller seviyesinde cross-project guard çalışıyor:
//   - kalemler.proje_id === query.proje_id zorunlu (aksi 403).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'yetkili' | 'staff' | null
  projectRole?: 'owner' | 'manager' | 'user' | 'staff' | 'viewer' | null
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

// Zod 4 .uuid() strict v4 pattern bekler (3.grup 4xxx, 4.grup [89abAB]xxx).
const PROJE_A = '11111111-1111-4111-a111-111111111111'
const PROJE_B = '22222222-2222-4222-a222-222222222222'
const PLAN_ID = '33333333-3333-4333-a333-333333333333'
const IS_KALEMI_ID = '44444444-4444-4444-a444-444444444444'

const validKalem = (overrides: Partial<Record<string, unknown>> = {}) => ({
  plan_id: PLAN_ID,
  proje_is_kalemi_id: IS_KALEMI_ID,
  proje_id: PROJE_A,
  ay: 6,
  planlanan_tutar: 1000,
  ...overrides,
})

describe('POST /api/projeler/yillik-plan-kalemleri/bulk — validation (P0 fix)', () => {
  beforeEach(() => {
    // Sprint user-role-readonly (2026-05-30): bulk yazma manager+ gerektirir.
    // Validation davranışını test etmek için actor manager (user → 403 alırdı).
    currentUser = { id: 'u-manager', role: 'staff', projectRole: 'manager' }
  })

  it('anon → 401', async () => {
    currentUser = null
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [validKalem()] })
    expect(res.status).toBe(401)
  })

  it('kalemler boş → 400', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [] })
    expect(res.status).toBe(400)
  })

  it('kalemler eksik → 400', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({})
    expect(res.status).toBe(400)
  })

  it('501 kalem (limit aşımı) → 400', async () => {
    const tooMany = Array.from({ length: 501 }, () => validKalem())
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: tooMany })
    expect(res.status).toBe(400)
  })

  it('kalem.ay > 12 → 400', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [validKalem({ ay: 13 })] })
    expect(res.status).toBe(400)
  })

  it('kalem.plan_id non-uuid → 400', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [validKalem({ plan_id: 'not-a-uuid' })] })
    expect(res.status).toBe(400)
  })

  it('cross-project enjeksiyonu (kalem.proje_id ≠ query.proje_id) → 403', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [validKalem({ proje_id: PROJE_B })] })
    expect(res.status).toBe(403)
  })

  it('geçerli payload + matching proje_id → not 400/403', async () => {
    const res = await request(app)
      .post('/api/projeler/yillik-plan-kalemleri/bulk')
      .query({ proje_id: PROJE_A })
      .send({ kalemler: [validKalem()] })
    expect(res.status).not.toBe(400)
    expect(res.status).not.toBe(403)
  })
})
