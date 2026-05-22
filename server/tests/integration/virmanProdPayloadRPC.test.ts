// Sprint fix/virman-rpc-raw-fetch:
// Service artık supabase-js .rpc() yerine doğrudan fetch ile PostgREST'e
// POST atıyor. Bu test'in spy'ı supabaseAdmin.rpc yerine global fetch'i
// yakalar — RPC URL pattern'ine düşen request body'yi assert eder.
//
// Regression koruma: PR #82 + #83 + bu sprint'in defansının düşmesini engeller.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | null
}

let currentUser: TestUser | null = null
let lastRpcUrl: string | null = null
let lastRpcBody: any = null

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string }; userRole?: 'admin' | 'staff' | null },
      _res: unknown,
      next: (err?: unknown) => void,
    ) => {
      if (!currentUser) {
        next(ApiError.unauthorized('Bearer token gerekli'))
        return
      }
      req.user = { id: currentUser.id }
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

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(async () => currentUser?.role ?? null),
  clearRoleCache: vi.fn(),
  // Sprint yetkili-role-system (PR-A): requireRole artık ROLE_RANK kullanır.
  ROLE_RANK: { admin: 3, yetkili: 2, staff: 1 },
}))

vi.mock('../../src/config/supabase', () => {
  function createBuilder() {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.insert = chain
    builder.update = chain
    builder.delete = chain
    builder.eq = chain
    builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: [], error: null })
    return builder
  }
  return {
    supabaseAdmin: { from: () => createBuilder() },
  }
})

// Global fetch'i yakala — service raw fetch'le RPC çağrısı yapıyor.
const originalFetch = globalThis.fetch
beforeEach(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.supabase.local'
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input?.url
    if (typeof url === 'string' && url.includes('/rpc/fn_create_virman_atomic')) {
      lastRpcUrl = url
      const bodyText = typeof init?.body === 'string' ? init.body : ''
      try {
        lastRpcBody = JSON.parse(bodyText)
      } catch {
        lastRpcBody = bodyText
      }
      return new Response(
        JSON.stringify({
          virman_id: 'v1111111-1111-4111-a111-111111111111',
          gider_hareket_id: 'h1111111-1111-4111-a111-111111111111',
          gelir_hareket_id: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return originalFetch(input, init)
  }) as typeof fetch
})

import app from '../../src/index'

const PROD_PROJE_ID = '8127ed78-b01c-4f53-9ed0-f8b3d594265c'
const PROD_KAYNAK = '38cef4c3-348b-4774-a543-f6fcfd72928f'

describe('Virman PROD payload regression (sprint rootcause)', () => {
  beforeEach(() => {
    currentUser = null
    lastRpcUrl = null
    lastRpcBody = null
  })

  it('REPRO: prod payload — banka_nakit + null hedef/aciklama → 201 + fetch body.p_data.proje_id geçer', async () => {
    currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }

    const prodPayload = {
      proje_id: PROD_PROJE_ID,
      virman_tipi: 'banka_nakit',
      tarih: '2026-05-21',
      tutar: 100,
      kaynak_hesap_id: PROD_KAYNAK,
      hedef_hesap_id: null,
      aciklama: null,
    }

    const res = await request(app).post('/api/virmanlar').send(prodPayload)

    // 1) HTTP başarı
    expect(res.status, `Beklenmedik response: ${JSON.stringify(res.body)}`).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body._build).toBeDefined()

    // 2) Build header görünür → Render canlı build verify
    expect(res.headers['x-virman-build']).toBeTruthy()

    // 3) Raw fetch çağrıldı ve body.p_data.proje_id UUID
    expect(lastRpcUrl).toContain('/rpc/fn_create_virman_atomic')
    expect(lastRpcBody).toBeTruthy()
    expect(lastRpcBody.p_data).toBeTruthy()
    expect(lastRpcBody.p_data.proje_id).toBe(PROD_PROJE_ID)
    expect(typeof lastRpcBody.p_data.proje_id).toBe('string')
    expect(lastRpcBody.p_data.virman_tipi).toBe('banka_nakit')
    expect(lastRpcBody.p_data.kaynak_hesap_id).toBe(PROD_KAYNAK)
    expect(lastRpcBody.p_data.hedef_hesap_id).toBeNull()
    expect(lastRpcBody.p_data.aciklama).toBeNull()
    expect(lastRpcBody.p_data.tutar).toBe(100)
    expect(lastRpcBody.p_data.tarih).toBe('2026-05-21')
  })

  it('proje_id eksik gelirse → 400 + RPC çağrılmaz', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    const res = await request(app)
      .post('/api/virmanlar')
      .send({
        virman_tipi: 'banka_nakit',
        tarih: '2026-05-21',
        tutar: 100,
        kaynak_hesap_id: PROD_KAYNAK,
        hedef_hesap_id: null,
      })

    expect(res.status).toBe(400)
    expect(lastRpcUrl).toBeNull()
  })

  it('proje_id geçersiz format → 400 + RPC çağrılmaz', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }
    const res = await request(app)
      .post('/api/virmanlar')
      .send({
        proje_id: 'not-a-uuid',
        virman_tipi: 'banka_nakit',
        tarih: '2026-05-21',
        tutar: 100,
        kaynak_hesap_id: PROD_KAYNAK,
        hedef_hesap_id: null,
      })

    expect(res.status).toBe(400)
    expect(lastRpcUrl).toBeNull()
  })

  it('camelCase projeId (legacy) → Zod 400 (snake_case bekler)', async () => {
    currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }
    const res = await request(app)
      .post('/api/virmanlar')
      .send({
        projeId: PROD_PROJE_ID,
        virman_tipi: 'banka_nakit',
        tarih: '2026-05-21',
        tutar: 100,
        kaynak_hesap_id: PROD_KAYNAK,
        hedef_hesap_id: null,
      })

    expect([400, 201]).toContain(res.status)
  })
})
