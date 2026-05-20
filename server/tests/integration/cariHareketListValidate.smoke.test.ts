// Regression: Express 5'te `req.query` getter-only. validate middleware'in
// `(req as any).query = schemas.query.parse(req.query)` direct atamasi
// strict mode'da TypeError firlatiyor → GET /api/cari-hareketler?exclude_tahakkuk=true
// 500 donuyor (PR #59 / 4b46d7d sonrasi).
//
// Bu test bug reprosudur: fix oncesinde 500, sonrasinda 200 donmeli.

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
  builder.or = chain
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
      rpc: async () => ({ data: [], error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

import app from '../../src/index'

const PROJE_ID = '1ffc058e-bcc7-484f-aeb6-c6178aeeb2e9'

describe('GET /api/cari-hareketler — query validate (Express 5 regression)', () => {
  beforeEach(() => {
    currentUser = { id: 'u-staff', role: 'staff', projectRole: 'viewer' }
  })

  it('exclude_tahakkuk=true ile 500 firlatmamali (TahsilatListPage path)', async () => {
    const res = await request(app)
      .get('/api/cari-hareketler')
      .query({
        proje_id: PROJE_ID,
        islem_turu_in: 'gelen_odeme,giden_odeme,iade_odeme,uyelik_baslangic',
        exclude_tahakkuk: 'true',
        baslangic_tarihi: '2026-01-01',
        bitis_tarihi: '2026-12-31',
      })

    expect(res.status).not.toBe(500)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('exclude_tahakkuk parametresi olmadan da calismali (US-4 backward-compat)', async () => {
    const res = await request(app)
      .get('/api/cari-hareketler')
      .query({ proje_id: PROJE_ID })

    expect(res.status).not.toBe(500)
    expect(res.status).toBe(200)
  })
})
