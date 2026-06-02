// Sprint kalite-guvenlik-2026-06 (TEST-1):
//   yonetimEkibi.service.ts 0 testliydi (PR #169 ekledi, SEC-3 #196 createPayment
//   RPC'sini değiştirdi). list/create/update/remove/createPayment + mass-assignment
//   ve IDOR guard'ları test altına alınır.
//
// Mock stratejisi: tek paylaşılan builder; zincir method'ları (select/eq/order/
//   insert/update/delete) builder döner ve vi.fn ile arg'ları yakalanır. Terminal
//   (order await / single / maybeSingle / await) sıradaki yanıtı `responses`
//   kuyruğundan tüketir. remove() iki DB işlemi yapar (find + delete) → 2 yanıt.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let responses: Array<{ data?: any; error?: any; count?: number }> = []
function nextResp() {
  return responses.length ? responses.shift() : { data: null, error: null }
}

const builder: any = {}
;['select', 'eq', 'order', 'insert', 'update', 'delete'].forEach((m) => {
  builder[m] = vi.fn(() => builder)
})
builder.single = vi.fn(() => Promise.resolve(nextResp()))
builder.maybeSingle = vi.fn(() => Promise.resolve(nextResp()))
builder.then = (resolve: any) => resolve(nextResp())

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => builder,
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { yonetimEkibiService } from '../../src/services/yonetimEkibi.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

beforeEach(() => {
  rpcMock.mockReset()
  responses = []
  ;['select', 'eq', 'order', 'insert', 'update', 'delete', 'single', 'maybeSingle'].forEach((m) =>
    builder[m].mockClear()
  )
})

describe('yonetimEkibiService.list', () => {
  it('proje_id yoksa 400', async () => {
    await expect(yonetimEkibiService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('bakiye = borc - alacak hesaplanır', async () => {
    responses.push({
      data: [
        { id: 'y1', ad_soyad: 'A', borc: 300, alacak: 100 },
        { id: 'y2', ad_soyad: 'B', borc: 0, alacak: 50 },
      ],
      error: null,
    })
    const r = await yonetimEkibiService.list({ proje_id: PROJE })
    expect(r[0].bakiye).toBe(200)
    expect(r[1].bakiye).toBe(-50)
    expect(builder.eq).toHaveBeenCalledWith('proje_id', PROJE)
  })

  it('DB error → throw', async () => {
    responses.push({ data: null, error: { message: 'boom' } })
    await expect(yonetimEkibiService.list({ proje_id: PROJE })).rejects.toBeTruthy()
  })
})

describe('yonetimEkibiService.create', () => {
  it('proje_id yoksa 400', async () => {
    await expect(yonetimEkibiService.create({ ad_soyad: 'A', oran: 5 })).rejects.toBeInstanceOf(ApiError)
  })

  it('insert + bakiye döner', async () => {
    responses.push({ data: { id: 'y1', ad_soyad: 'A', borc: 0, alacak: 0 }, error: null })
    const r = await yonetimEkibiService.create({ proje_id: PROJE, ad_soyad: 'A', oran: 5 })
    expect(r.bakiye).toBe(0)
    expect(builder.insert).toHaveBeenCalledWith([{ proje_id: PROJE, ad_soyad: 'A', oran: 5 }])
  })
})

describe('yonetimEkibiService.update', () => {
  it('proje_id yoksa 400', async () => {
    await expect(yonetimEkibiService.update('y1', { ad_soyad: 'X' })).rejects.toBeInstanceOf(ApiError)
  })

  it('mass-assignment: proje_id/borc/alacak payload\'a yazılmaz', async () => {
    responses.push({ data: { id: 'y1', ad_soyad: 'X', borc: 10, alacak: 0 }, error: null })
    await yonetimEkibiService.update('y1', {
      proje_id: PROJE,
      ad_soyad: 'X',
      oran: 7,
      borc: 9999,
      alacak: 8888,
    })
    const payload = builder.update.mock.calls[0][0]
    expect(payload.ad_soyad).toBe('X')
    expect(payload.oran).toBe(7)
    expect(payload).not.toHaveProperty('borc')
    expect(payload).not.toHaveProperty('alacak')
    expect(payload).not.toHaveProperty('proje_id')
    // IDOR defense-in-depth: proje_id ile scope edilir
    expect(builder.eq).toHaveBeenCalledWith('proje_id', PROJE)
    expect(builder.eq).toHaveBeenCalledWith('id', 'y1')
  })

  it('kayıt yoksa (maybeSingle null) → 404', async () => {
    responses.push({ data: null, error: null })
    await expect(
      yonetimEkibiService.update('y1', { proje_id: PROJE, ad_soyad: 'X' })
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('yonetimEkibiService.remove', () => {
  it('proje_id yoksa 400', async () => {
    await expect(yonetimEkibiService.remove('y1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('kayıt yoksa → 404 (delete çağrılmaz)', async () => {
    responses.push({ data: null, error: null }) // find: yok
    await expect(yonetimEkibiService.remove('y1', PROJE)).rejects.toBeInstanceOf(ApiError)
    expect(builder.delete).not.toHaveBeenCalled()
  })

  it('IDOR: kayıt başka projede → 404 (delete çağrılmaz)', async () => {
    responses.push({ data: { id: 'y1', proje_id: 'OTHER' }, error: null })
    await expect(yonetimEkibiService.remove('y1', PROJE)).rejects.toBeInstanceOf(ApiError)
    expect(builder.delete).not.toHaveBeenCalled()
  })

  it('aynı projede → silinir', async () => {
    responses.push({ data: { id: 'y1', proje_id: PROJE }, error: null }) // find
    responses.push({ error: null }) // delete
    const r = await yonetimEkibiService.remove('y1', PROJE)
    expect(r).toEqual({ id: 'y1', deleted: true })
    expect(builder.delete).toHaveBeenCalled()
  })
})

describe('yonetimEkibiService.createPayment', () => {
  it('proje_id yoksa 400', async () => {
    await expect(
      yonetimEkibiService.createPayment({
        proje_id: '',
        yonetim_id: 'y1',
        islem_turu: 'giden_odeme',
        odeme_turu: 'nakit',
        tutar: 100,
        tarih: '2026-06-01',
      })
    ).rejects.toBeInstanceOf(ApiError)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('RPC fn_create_yonetim_payment_atomic doğru payload ile çağrılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: { yonetim_id: 'y1', bakiye: -100 }, error: null })
    await yonetimEkibiService.createPayment({
      proje_id: PROJE,
      yonetim_id: 'y1',
      islem_turu: 'giden_odeme',
      odeme_turu: 'banka',
      banka_hesap_id: 'b1',
      tutar: 100,
      tarih: '2026-06-01',
      aciklama: 'test',
    })
    expect(rpcMock).toHaveBeenCalledWith('fn_create_yonetim_payment_atomic', {
      p_payment_data: {
        proje_id: PROJE,
        yonetim_id: 'y1',
        islem_turu: 'giden_odeme',
        odeme_turu: 'banka',
        banka_hesap_id: 'b1',
        tutar: 100,
        tarih: '2026-06-01',
        aciklama: 'test',
      },
    })
  })

  it('banka_hesap_id/aciklama yoksa null normalize edilir', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    await yonetimEkibiService.createPayment({
      proje_id: PROJE,
      yonetim_id: 'y1',
      islem_turu: 'gelen_odeme',
      odeme_turu: 'nakit',
      tutar: 50,
      tarih: '2026-06-01',
    })
    const payload = rpcMock.mock.calls[0][1].p_payment_data
    expect(payload.banka_hesap_id).toBeNull()
    expect(payload.aciklama).toBeNull()
  })

  it('RPC error → throw (örn. SEC-3 yabancı banka_hesap)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Banka hesabı bu projeye ait değil' } })
    await expect(
      yonetimEkibiService.createPayment({
        proje_id: PROJE,
        yonetim_id: 'y1',
        islem_turu: 'gelen_odeme',
        odeme_turu: 'banka',
        banka_hesap_id: 'foreign',
        tutar: 50,
        tarih: '2026-06-01',
      })
    ).rejects.toBeTruthy()
  })
})
