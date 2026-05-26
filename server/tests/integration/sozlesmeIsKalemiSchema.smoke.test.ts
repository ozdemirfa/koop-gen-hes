// Regression: PR #136 sözleşme IDOR fix sonrası controller addIsKalemi/
// updateIsKalemi `extractProjeId(req)` ile body'den proje_id okuyor. Ama
// isKalemiSchema'da `proje_id` alanı yoktu — Zod default `.strip()` mode'unda
// validate middleware body'den proje_id'yi siliyor → controller 400
// "proje_id zorunludur" üretiyordu (2026-05-26 production incident).
//
// Bu test bug reproduce: schema'da proje_id eklendikten sonra POST/PUT
// is-kalemleri body'sinde proje_id korunmalı; service `extractProjeId` ile
// okuyup `.eq('proje_id')` cross-check yapabilmeli.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  email?: string
  role: 'admin' | 'staff' | null
  projectRole?: 'admin' | 'staff' | 'viewer' | 'owner' | 'manager' | 'user' | null
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

// Mock supabase: addIsKalemi servisi önce parent sözleşmenin proje_id'sini
// doğrular (assertSozlesmeInProje), sonra INSERT yapar. İki çağrı da row döner.
vi.mock('../../src/config/supabase', () => {
  const sozlesmeRow = { id: 'sozlesme-1', proje_id: '1ffc058e-bcc7-484f-aeb6-c6178aeeb2e9' }
  const kalemRow = {
    id: 'kalem-1',
    sozlesme_id: 'sozlesme-1',
    tanim: 'Beton dökümü',
    birim: 'm3',
    miktar: 10,
    birim_fiyat: 5000,
    sira_no: 1,
  }
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.insert = chain
    builder.update = chain
    builder.delete = chain
    builder.upsert = chain
    builder.eq = chain
    builder.order = chain
    builder.single = async () => ({ data: kalemRow, error: null })
    builder.maybeSingle = async () => ({ data: sozlesmeRow, error: null })
    builder.then = (resolve: (v: { data: unknown; error: unknown; count: number }) => void) =>
      resolve({ data: [kalemRow], error: null, count: 0 })
    return builder
  }
  return {
    supabaseAdmin: {
      from: () => makeBuilder(),
      rpc: async () => ({ data: [], error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

import app from '../../src/index'

const PROJE_ID = '1ffc058e-bcc7-484f-aeb6-c6178aeeb2e9'
const SOZLESME_ID = 'sozlesme-1'

describe('POST /api/sozlesmeler/:id/is-kalemleri — Zod strip regression (2026-05-26)', () => {
  beforeEach(() => {
    currentUser = { id: 'u-1', role: 'staff', projectRole: 'user' }
  })

  it('body.proje_id Zod tarafından strip edilmemeli; 400 dönmemeli', async () => {
    const res = await request(app)
      .post(`/api/sozlesmeler/${SOZLESME_ID}/is-kalemleri`)
      .send({
        proje_id: PROJE_ID,
        tanim: 'Beton dökümü',
        birim: 'm3',
        miktar: 10,
        birim_fiyat: 5000,
        sira_no: 1,
      })

    expect(res.status).not.toBe(400)
    expect(res.body.error).not.toBe('proje_id zorunludur')
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('body proje_id eksikse middleware 400 dönmeli (defansif)', async () => {
    const res = await request(app)
      .post(`/api/sozlesmeler/${SOZLESME_ID}/is-kalemleri`)
      .send({
        tanim: 'Beton dökümü',
        birim: 'm3',
        miktar: 10,
        birim_fiyat: 5000,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/proje_id/i)
  })
})
