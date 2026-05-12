// REV-FIFO-04 (2026-05-12): FIFO Yeniden Dağıt endpoint integration testi.
//
// Scope: HTTP-level. authMiddleware + supabaseAdmin mocklanır. RPC mock,
// fn_realloc_member_payments_fifo'nun beklenen response shape'ini döner.
// Asıl SQL davranışının doğruluğu DB-side migration testi ile değil burada
// kontrol edilemez — bu test endpoint kontratını + RBAC'i + hata yollarını
// kapsar.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
}

let currentUser: TestUser | null = null
let rpcShouldFail = false

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

vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.insert = chain
  builder.update = chain
  builder.delete = chain
  builder.eq = chain
  builder.order = chain
  builder.range = chain
  builder.single = async () => ({ data: null, error: null })
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
    resolve({ data: [], error: null, count: 0 })

  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async (fnName: string) => {
        if (rpcShouldFail) {
          return { data: null, error: { message: 'Simulated DB error', code: 'P0001' } }
        }
        if (fnName === 'fn_realloc_member_payments_fifo') {
          return {
            data: {
              success: true,
              message: 'FIFO yeniden dağıtım tamamlandı',
              detach_count: 4,
              recomputed_count: 8,
              fifo_result: { success: true, matched_count: 7 },
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

describe('POST /api/uyeler/:id/realloc-payments', () => {
  beforeEach(() => {
    currentUser = null
    rpcShouldFail = false
  })

  const uyeId = 'a1111111-1111-4111-a111-111111111111'
  const projeId = 'a2222222-2222-4222-a222-222222222222'

  it('admin → 200 + detach_count + recomputed_count payload', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    const res = await request(app)
      .post(`/api/uyeler/${uyeId}/realloc-payments`)
      .query({ proje_id: projeId })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        success: true,
        detach_count: 4,
        recomputed_count: 8,
      }),
    })
  })

  it('staff → 403 (admin-only — bu endpoint geçmiş kayıtları manipüle eder)', async () => {
    currentUser = { id: 'u-staff', role: 'staff' }
    const res = await request(app)
      .post(`/api/uyeler/${uyeId}/realloc-payments`)
      .query({ proje_id: projeId })
    expect(res.status).toBe(403)
  })

  it('anon → 401', async () => {
    const res = await request(app)
      .post(`/api/uyeler/${uyeId}/realloc-payments`)
      .query({ proje_id: projeId })
    expect(res.status).toBe(401)
  })

  it('proje_id eksik → 400', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    const res = await request(app).post(`/api/uyeler/${uyeId}/realloc-payments`)
    expect(res.status).toBe(400)
  })

  it('RPC hatası → error propagation (non-2xx)', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    rpcShouldFail = true
    const res = await request(app)
      .post(`/api/uyeler/${uyeId}/realloc-payments`)
      .query({ proje_id: projeId })
    // errorHandler Supabase PostgrestError'ı (message+code) ApiError'a sarmıyor;
    // 400'lü bir hata kodu ile yansır. Önemli olan 2xx olmaması.
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.body.success).not.toBe(true)
  })
})
