// Sprint qa-review-bugfix-faz3 (2026-05-25, P0 #2):
// `multer({ storage: memoryStorage() })` önceden no-limit idi — büyük binary
// upload → memory exhaustion riski. Şimdi 5MB cap + tek dosya + CSV-only
// fileFilter. errorHandler.ts MulterError'ları 413/400'e maple ediyor.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

interface TestUser {
  id: string
  role: 'admin' | 'yetkili' | 'staff' | null
  projectRole?: 'owner' | 'manager' | 'user' | 'staff' | null
}

let currentUser: TestUser | null = null

vi.mock('../../src/middleware/auth', async () => {
  const { ApiError } = await import('../../src/utils/ApiError')
  return {
    authMiddleware: (
      req: { user?: { id: string }; userRole?: 'admin' | 'staff' | null },
      _res: unknown,
      next: (err?: unknown) => void
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

vi.mock('../../src/config/supabase', () => {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.insert = chain
  builder.update = chain
  builder.delete = chain
  builder.upsert = chain
  builder.eq = chain
  builder.single = async () => ({ data: null, error: null })
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    resolve({ data: [], error: null })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: async () => ({ data: null, error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    },
  }
})

import app from '../../src/index'

const PROJE_ID = '11111111-1111-1111-1111-111111111111'

describe('POST /api/projeler/:id/serefiye/import — multer limits (P0 fix)', () => {
  beforeEach(() => {
    currentUser = { id: 'u-mgr', role: 'staff', projectRole: 'manager' }
  })

  it('CSV içeriği < 5MB → not 413/400', async () => {
    const csv = Buffer.from('blok_adi,daire_no,serefiye\nA,1,1.0\n', 'utf-8')
    const res = await request(app)
      .post(`/api/projeler/${PROJE_ID}/serefiye/import`)
      .query({ proje_id: PROJE_ID })
      .attach('file', csv, { filename: 'serefiye.csv', contentType: 'text/csv' })
    expect(res.status).not.toBe(413)
    expect(res.status).not.toBe(400)
  })

  it('6 MB dosya → 413 (LIMIT_FILE_SIZE)', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 'a')
    const res = await request(app)
      .post(`/api/projeler/${PROJE_ID}/serefiye/import`)
      .query({ proje_id: PROJE_ID })
      .attach('file', big, { filename: 'big.csv', contentType: 'text/csv' })
    expect(res.status).toBe(413)
    expect(res.body?.error).toMatch(/sınır|aşıyor/i)
  })

  it('PDF dosyası → 400 (CSV_ONLY)', async () => {
    const pdf = Buffer.from('%PDF-1.4\n', 'utf-8')
    const res = await request(app)
      .post(`/api/projeler/${PROJE_ID}/serefiye/import`)
      .query({ proje_id: PROJE_ID })
      .attach('file', pdf, { filename: 'doc.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
    expect(res.body?.error).toMatch(/CSV/i)
  })

  it('dosya hiç gönderilmedi → 400 (ApiError.badRequest, generic 500 değil)', async () => {
    const res = await request(app)
      .post(`/api/projeler/${PROJE_ID}/serefiye/import`)
      .query({ proje_id: PROJE_ID })
    expect(res.status).toBe(400)
    expect(res.body?.error).toMatch(/Dosya/i)
  })
})
