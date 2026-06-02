// Sprint kalite-guvenlik-2026-06 (TEST-5):
//   api.ts axios interceptor'ları — proje_id enjeksiyonu (params/body), aktif
//   proje header'ı, Authorization, endpoint istisnaları (projeler/firmalar/
//   settings/admin/is-kalemleri), multipart koruması, response statusCode ekleme.
//   Interceptor handler'ları doğrudan çağrılır (axios .handlers); DOM gerekmez.

import { describe, it, expect, vi, beforeEach } from 'vitest'

let activeId: string | null = 'a1111111-1111-4111-a111-111111111111'

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok-123' } } }) },
  },
}))
vi.mock('./activeProjectStore', () => ({
  getActiveProjectId: () => activeId,
}))

import api from './api'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

// axios InterceptorManager handler'larına eriş (son kayıtlı).
const reqHandler = (api.interceptors.request as any).handlers.filter(Boolean).pop().fulfilled
const resRejected = (api.interceptors.response as any).handlers.filter(Boolean).pop().rejected

async function runReq(cfg: any) {
  return reqHandler({ headers: {}, ...cfg })
}

beforeEach(() => {
  activeId = PROJE
})

describe('api request interceptor', () => {
  it('Authorization + X-Active-Project-Id header ekler', async () => {
    const c = await runReq({ url: '/uyeler', method: 'get' })
    expect(c.headers.Authorization).toBe('Bearer tok-123')
    expect(c.headers['X-Active-Project-Id']).toBe(PROJE)
  })

  it('GET: proje_id params\'a enjekte edilir', async () => {
    const c = await runReq({ url: '/uyeler', method: 'get' })
    expect(c.params.proje_id).toBe(PROJE)
  })

  it('GET: mevcut proje_id ezilmez', async () => {
    const c = await runReq({ url: '/uyeler', method: 'get', params: { proje_id: 'EXISTING' } })
    expect(c.params.proje_id).toBe('EXISTING')
  })

  it('POST: proje_id body\'ye enjekte edilir', async () => {
    const c = await runReq({ url: '/uyeler', method: 'post', data: { ad: 'A' } })
    expect(c.data.proje_id).toBe(PROJE)
    expect(c.data.ad).toBe('A')
  })

  it('POST bodyless: body { proje_id } yaratılır', async () => {
    const c = await runReq({ url: '/hakedisler/h1/onayla', method: 'post', data: null })
    expect(c.data).toEqual({ proje_id: PROJE })
  })

  it('multipart (FormData) body\'ye dokunmaz', async () => {
    const fd = new FormData()
    const c = await runReq({ url: '/uyeler', method: 'post', data: fd })
    expect(c.data).toBe(fd)
  })

  it('/projeler endpoint: proje_id enjekte edilmez', async () => {
    const c = await runReq({ url: '/projeler', method: 'get' })
    expect(c.params?.proje_id).toBeUndefined()
  })

  it('/firmalar (global) endpoint: proje_id enjekte edilmez ama header yine var', async () => {
    const c = await runReq({ url: '/firmalar', method: 'get' })
    expect(c.params?.proje_id).toBeUndefined()
    expect(c.headers['X-Active-Project-Id']).toBe(PROJE)
  })

  it('/is-kalemleri alt-kaynak: proje_id enjekte edilmez', async () => {
    const c = await runReq({ url: '/sozlesmeler/s1/is-kalemleri', method: 'get' })
    expect(c.params?.proje_id).toBeUndefined()
  })

  it('aktif proje yoksa: header ve enjeksiyon yok', async () => {
    activeId = null
    const c = await runReq({ url: '/uyeler', method: 'get' })
    expect(c.headers['X-Active-Project-Id']).toBeUndefined()
    expect(c.params?.proje_id).toBeUndefined()
  })
})

describe('api response interceptor', () => {
  it('hata gövdesine non-enumerable statusCode ekler + reddeder', async () => {
    const err = { response: { data: { error: 'Yetkisiz' }, status: 403 } }
    await expect(resRejected(err)).rejects.toMatchObject({ error: 'Yetkisiz' })
    try {
      await resRejected(err)
    } catch (rejected: any) {
      expect(rejected.statusCode).toBe(403)
      // non-enumerable → JSON.stringify görmez
      expect(Object.keys(rejected)).not.toContain('statusCode')
    }
  })

  it('response/data yoksa AxiosError aynen reddedilir', async () => {
    const err = new Error('network')
    await expect(resRejected(err)).rejects.toBe(err)
  })
})
