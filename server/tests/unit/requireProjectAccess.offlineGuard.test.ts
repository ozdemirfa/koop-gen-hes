import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../src/utils/ApiError'

// Sprint desktop-offline-mode (2026-05-26):
//   requireProjectAccess mutation method'larında (POST/PUT/PATCH/DELETE) varsayılan
//   olarak offline_mode guard çalıştırır. Proje offline'da ve çağıran owner değilse
//   403 + Türkçe mesaj döner. Toggle endpoint'i { skipOfflineCheck: true } ile
//   bu davranışı devre dışı bırakır (chicken-and-egg).
//
// Bu test dosyası yalnız offline guard davranışına odaklanır; rol/membership
// senaryoları için requireProjectAccess.test.ts'e bakın.

vi.mock('../../src/middleware/roleCache', () => ({
  getUserRole: vi.fn(),
}))

vi.mock('../../src/middleware/projectAccessCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/middleware/projectAccessCache')>(
    '../../src/middleware/projectAccessCache'
  )
  return {
    ...actual,
    getProjectRole: vi.fn(),
    clearProjectAccessCache: vi.fn(),
  }
})

// supabaseAdmin.from('projeler').select('...').eq('id', X).maybeSingle() chain'i mock
const mockMaybeSingle = vi.fn()
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args as []),
  },
}))

import {
  requireProjectAccess,
  invalidateOfflineGuardCache,
} from '../../src/middleware/requireProjectAccess'
import { getProjectRole } from '../../src/middleware/projectAccessCache'

const mockedGetProjectRole = vi.mocked(getProjectRole)

const PROJE_ID = '11111111-1111-1111-1111-111111111111'
const OWNER_ID = 'owner-user-id'
const NON_OWNER_ID = 'non-owner-user-id'

interface ReqInput {
  user?: { id: string }
  userRole?: 'admin' | 'staff' | null
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  params?: Record<string, string>
  baseUrl?: string
  method?: string
}

function makeReq(input: ReqInput = {}): Request {
  const req: Partial<Request> = {
    user: input.user,
    userRole: input.userRole,
    body: input.body ?? {},
    query: input.query ?? ({} as any),
    params: input.params ?? {},
    baseUrl: input.baseUrl ?? '',
    method: input.method ?? 'GET',
  }
  return req as Request
}

function runMiddleware(handler: ReturnType<typeof requireProjectAccess>, req: Request) {
  return new Promise<unknown>((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve(err)
    handler(req, {} as Response, next)
  })
}

describe('requireProjectAccess — offline_mode guard', () => {
  beforeEach(() => {
    mockedGetProjectRole.mockReset()
    mockMaybeSingle.mockReset()
    mockEq.mockClear()
    mockSelect.mockClear()
    mockFrom.mockClear()
    // Her test öncesi cache'i temizle — testler arası state kirlenmesin
    invalidateOfflineGuardCache(PROJE_ID)
  })

  describe('online proje (offline_mode = false)', () => {
    it('non-owner POST geçer (mutation + offline OFF)', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('user')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: false, offline_mode_owner_id: null },
        error: null,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'POST',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      expect(result).toBeUndefined()
    })
  })

  describe('offline proje + non-owner (kullanıcının ana case)', () => {
    it('non-owner POST → 403 Türkçe mesaj', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('user')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'POST',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
      expect((result as ApiError).message).toMatch(/çevrimdışı|cevrimdisi/i)
      expect((result as ApiError).message).toMatch(/proje sahibi|owner/i)
    })

    it('non-owner PUT → 403', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('manager')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'PUT',
      })
      const result = await runMiddleware(requireProjectAccess('manager'), req)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('non-owner PATCH → 403', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('user')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'PATCH',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('non-owner DELETE → 403', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('manager')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'DELETE',
      })
      const result = await runMiddleware(requireProjectAccess('manager'), req)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as ApiError).statusCode).toBe(403)
    })

    it('non-owner GET geçer (read-only her zaman açık)', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('user')
      // GET için offline state hiç sorgulanmamalı — maybeSingle çağrılmayacak
      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        query: { proje_id: PROJE_ID },
        method: 'GET',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      expect(result).toBeUndefined()
      expect(mockMaybeSingle).not.toHaveBeenCalled()
    })
  })

  describe('offline proje + owner geçer', () => {
    it('offline owner POST → 200 (yazma yetkili tek kişi)', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('owner')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'POST',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      expect(result).toBeUndefined()
    })

    it('offline owner DELETE → 200', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('owner')
      mockMaybeSingle.mockResolvedValueOnce({
        data: { offline_mode: true, offline_mode_owner_id: OWNER_ID },
        error: null,
      })

      const req = makeReq({
        user: { id: OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'DELETE',
      })
      const result = await runMiddleware(requireProjectAccess('owner'), req)
      expect(result).toBeUndefined()
    })
  })

  describe('offline proje + global admin geçer', () => {
    it('global admin offline projeyi yazabilir (incident response)', async () => {
      // Global admin getProjectRole çağırmadan owner gibi geçer; offline guard
      // da admin'i atlamalı.
      const req = makeReq({
        user: { id: 'admin-user-id' },
        userRole: 'admin',
        body: { proje_id: PROJE_ID },
        method: 'POST',
      })
      const result = await runMiddleware(requireProjectAccess('manager'), req)
      expect(result).toBeUndefined()
      // Admin shortcut → offline state hiç sorgulanmamalı
      expect(mockMaybeSingle).not.toHaveBeenCalled()
    })
  })

  describe('skipOfflineCheck opsiyon flag (toggle endpoint için)', () => {
    it('owner offline projeyi { skipOfflineCheck: true } ile online\'a alabilir', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('owner')
      // offline_mode state sorgulanmamalı — flag opt-out etmiş

      const req = makeReq({
        user: { id: OWNER_ID },
        userRole: 'staff',
        params: { id: PROJE_ID },
        baseUrl: '/api/projeler',
        body: { offline_mode: false },
        method: 'PATCH',
      })
      const result = await runMiddleware(
        requireProjectAccess('owner', { skipOfflineCheck: true }),
        req,
      )
      expect(result).toBeUndefined()
      expect(mockMaybeSingle).not.toHaveBeenCalled()
    })
  })

  describe('cache + invalidation', () => {
    it('aynı proje_id için ardışık çağrılarda tek DB hit (cache)', async () => {
      mockedGetProjectRole.mockResolvedValue('user')
      mockMaybeSingle.mockResolvedValue({
        data: { offline_mode: false, offline_mode_owner_id: null },
        error: null,
      })

      const makeReqFresh = () =>
        makeReq({
          user: { id: NON_OWNER_ID },
          userRole: 'staff',
          body: { proje_id: PROJE_ID },
          method: 'POST',
        })

      await runMiddleware(requireProjectAccess('user'), makeReqFresh())
      await runMiddleware(requireProjectAccess('user'), makeReqFresh())
      await runMiddleware(requireProjectAccess('user'), makeReqFresh())

      // İlk çağrıda DB hit, sonrakiler cache'ten
      expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
    })

    it('invalidateOfflineGuardCache sonrası DB tekrar sorgulanır', async () => {
      mockedGetProjectRole.mockResolvedValue('user')
      mockMaybeSingle.mockResolvedValue({
        data: { offline_mode: false, offline_mode_owner_id: null },
        error: null,
      })

      await runMiddleware(
        requireProjectAccess('user'),
        makeReq({
          user: { id: NON_OWNER_ID },
          userRole: 'staff',
          body: { proje_id: PROJE_ID },
          method: 'POST',
        }),
      )
      invalidateOfflineGuardCache(PROJE_ID)
      await runMiddleware(
        requireProjectAccess('user'),
        makeReq({
          user: { id: NON_OWNER_ID },
          userRole: 'staff',
          body: { proje_id: PROJE_ID },
          method: 'POST',
        }),
      )

      expect(mockMaybeSingle).toHaveBeenCalledTimes(2)
    })
  })

  describe('hata durumları (defansif)', () => {
    it('DB okuma hatası → mutation geçer (RLS son savunma)', async () => {
      mockedGetProjectRole.mockResolvedValueOnce('user')
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'connection timeout' } as any,
      })

      const req = makeReq({
        user: { id: NON_OWNER_ID },
        userRole: 'staff',
        body: { proje_id: PROJE_ID },
        method: 'POST',
      })
      const result = await runMiddleware(requireProjectAccess('user'), req)
      // Yanlış-pozitif 403 yerine RLS'e bırak; offline state belirsizken
      // 503 patlamayalım.
      expect(result).toBeUndefined()
    })
  })
})
