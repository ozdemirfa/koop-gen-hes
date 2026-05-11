// CODE-005 (sprint 20260511-backlog-closure):
//
// Happy-path integration test for POST /api/cari-hareketler/payment.
//
// Scope: HTTP-level. authMiddleware + supabaseAdmin mocklanır; gerçek DB hit
// edilmez. RBAC (requireRole('staff')) ve cariPaymentSchema validate'i geçer,
// service _createPaymentNormal RPC mock'undan başarı objesi alır, 201 döner.
//
// rbac.smoke.test.ts ile aynı mock pattern; sadece RPC mock'u burada success
// data döndürür (orada null'di). İki test dosyası ortak supabase mock'u
// paylaşmaz çünkü vi.mock module-scope; her file kendi mock'unu kurar.

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

// supabaseAdmin mock — RPC happy path: fn_create_payment_atomic başarılı obj döner.
// from() builder default chain — controller _createPaymentNormal path'i sadece RPC
// kullandığı için from() ile ilgilenmiyoruz (cek path olmadığı için).
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
      rpc: async (fnName: string) => {
        if (fnName === 'fn_create_payment_atomic') {
          return {
            data: {
              hareket_id: 'mock-hareket-uuid-0001',
              success: true,
              matched_count: 0,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

import app from '../../src/index'

describe('POST /api/cari-hareketler/payment (happy path)', () => {
  beforeEach(() => {
    currentUser = null
  })

  // Note: Zod v4 strict UUID validation — v4 format required (xxxxxxxx-xxxx-4xxx-Vxxx-xxxxxxxxxxxx)
  const validPayload = {
    proje_id: 'a1111111-1111-4111-a111-111111111111',
    cari_hesap_id: 'a2222222-2222-4222-a222-222222222222',
    islem_turu: 'gelen_odeme',
    odeme_turu: 'nakit',
    tutar: 1500.5,
    tarih: '2026-05-11',
    aciklama: 'Test payment',
  }

  it('staff → 201 + success payload (gelen_odeme, nakit)', async () => {
    currentUser = { id: 'u-staff', role: 'staff' }
    const res = await request(app).post('/api/cari-hareketler/payment').send(validPayload)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        success: true,
        hareket_id: 'mock-hareket-uuid-0001',
      }),
    })
  })

  it('admin → 201 (hierarchical: admin staff yetkisini kapsar)', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    const res = await request(app).post('/api/cari-hareketler/payment').send(validPayload)
    expect(res.status).toBe(201)
  })

  it('anon → 401 (auth required)', async () => {
    const res = await request(app).post('/api/cari-hareketler/payment').send(validPayload)
    expect(res.status).toBe(401)
  })

  it('null role → 403 (auth ok, role yok)', async () => {
    currentUser = { id: 'u-orphan', role: null }
    const res = await request(app).post('/api/cari-hareketler/payment').send(validPayload)
    expect(res.status).toBe(403)
  })

  it('schema invalid (tutar negatif) → 400', async () => {
    currentUser = { id: 'u-staff', role: 'staff' }
    const res = await request(app)
      .post('/api/cari-hareketler/payment')
      .send({ ...validPayload, tutar: -100 })
    expect(res.status).toBe(400)
  })

  it('uyelik_baslangic + banka_hesap_id → 400 (superRefine reddi)', async () => {
    currentUser = { id: 'u-staff', role: 'staff' }
    const res = await request(app)
      .post('/api/cari-hareketler/payment')
      .send({
        ...validPayload,
        islem_turu: 'uyelik_baslangic',
        odeme_turu: 'cari',
        banka_hesap_id: 'a3333333-3333-4333-a333-333333333333',
      })
    expect(res.status).toBe(400)
  })
})
