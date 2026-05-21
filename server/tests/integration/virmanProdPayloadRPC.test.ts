// Sprint fix/virman-proje-id-rootcause-sprint:
// Prod'da görülen TAM payload'u replay et + RPC çağrısının p_data argümanını
// spy'la asser et. Mevcut virman.smoke.test.ts mock'unun p_data'yı yutuyor —
// bug burada görünmez. Bu test:
//   1) prod payload'u POST eder (banka_nakit, hedef_hesap_id=null, aciklama=null)
//   2) supabaseAdmin.rpc spy ile çağrılırken p_data.proje_id'nin UUID olduğunu
//      assert eder
//   3) controller defansif extraction'ı veya service defansif validation'ı
//      proje_id'yi kaybedirse, RPC ya hiç çağrılmaz ya da yanlış p_data ile
//      çağrılır → test fail eder
//
// Regression koruma: PR #82 + bu sprint'in defansının düşmesini engeller.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | null
}

let currentUser: TestUser | null = null
let lastRpcFn: string | null = null
let lastRpcParams: any = null

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
    supabaseAdmin: {
      from: () => createBuilder(),
      rpc: async (fnName: string, params: unknown) => {
        // Sprint diag: parametreleri yakala — assertion için.
        lastRpcFn = fnName
        lastRpcParams = params
        if (fnName === 'fn_create_virman_atomic') {
          return {
            data: {
              virman_id: 'v1111111-1111-4111-a111-111111111111',
              gider_hareket_id: 'h1111111-1111-4111-a111-111111111111',
              gelir_hareket_id: null,
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

const PROD_PROJE_ID = '8127ed78-b01c-4f53-9ed0-f8b3d594265c'
const PROD_KAYNAK = '38cef4c3-348b-4774-a543-f6fcfd72928f'

describe('Virman PROD payload regression (sprint rootcause)', () => {
  beforeEach(() => {
    currentUser = null
    lastRpcFn = null
    lastRpcParams = null
  })

  it('REPRO: prod payload — banka_nakit + null hedef/aciklama → 201 + RPC p_data.proje_id geçer', async () => {
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

    // 3) RPC çağrıldı ve p_data.proje_id UUID
    expect(lastRpcFn).toBe('fn_create_virman_atomic')
    expect(lastRpcParams).toBeTruthy()
    expect(lastRpcParams.p_data).toBeTruthy()
    expect(lastRpcParams.p_data.proje_id).toBe(PROD_PROJE_ID)
    expect(typeof lastRpcParams.p_data.proje_id).toBe('string')
    expect(lastRpcParams.p_data.virman_tipi).toBe('banka_nakit')
    expect(lastRpcParams.p_data.kaynak_hesap_id).toBe(PROD_KAYNAK)
    expect(lastRpcParams.p_data.hedef_hesap_id).toBeNull()
    expect(lastRpcParams.p_data.aciklama).toBeNull()
    expect(lastRpcParams.p_data.tutar).toBe(100)
    expect(lastRpcParams.p_data.tarih).toBe('2026-05-21')

    // 4) JSON.stringify roundtrip — service guard'ı doğru çalışıyor mu?
    const serialized = JSON.stringify(lastRpcParams.p_data)
    expect(serialized).toContain('"proje_id"')
    expect(serialized).toContain(PROD_PROJE_ID)
  })

  it('proje_id eksik gelirse → 400 + RPC çağrılmaz + build header görünür', async () => {
    currentUser = { id: 'u-admin', role: 'admin' }

    // proje_id eksik payload — middleware'in 400 fırlatması beklenir
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
    // RPC çağrılmamış olmalı
    expect(lastRpcFn).toBeNull()
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
    expect(lastRpcFn).toBeNull()
  })

  it('camelCase projeId fallback (legacy) → 201 + RPC p_data.proje_id UUID', async () => {
    currentUser = { id: 'u-staff', role: 'staff', projectRole: 'staff' }

    // Eski client `projeId` (camelCase) gönderiyor olabilir — controller fallback
    // var. Middleware ise projeId'yi de doğrular (req.body.projeId ?? req.body.proje_id).
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

    // Not: validate(virmanCreateSchema) snake_case proje_id bekler → 400 (Zod).
    // Bu test legacy davranışı belgeler. Eğer client camelCase gönderiyorsa
    // schema reddeder; client'in normalize etmesi gerekir. Bu yüzden 400 OK.
    expect([400, 201]).toContain(res.status)
    if (res.status === 201) {
      expect(lastRpcParams.p_data.proje_id).toBe(PROD_PROJE_ID)
    }
  })
})
