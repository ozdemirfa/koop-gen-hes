// Sprint qa-review-bugfix-faz3 Batch 3 — uye.service + blokService unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let nextData: any = null
let nextError: any = null
let nextCount = 0

// İlk maybeSingle çağrısı pre-check; sonraki çağrılar normal.
let deleteError: any = null
vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.is = () => builder
  builder.not = () => builder
  builder.or = () => builder
  builder.update = () => builder
  builder.insert = () => builder
  builder.delete = () => {
    // delete chain'ini ayır: pre-check'in error'unu degil deleteError'i don.
    const del: any = {}
    del.eq = () => del
    del.then = (r: any) => r({ error: deleteError ?? nextError })
    return del
  }
  builder.range = () => Promise.resolve({ data: nextData, error: nextError, count: nextCount })
  builder.order = () => builder
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.maybeSingle = async () => ({ data: nextData, error: null })  // pre-check error yok
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { uyeService, blokService } from '../../src/services/uye.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
  nextData = null
  nextError = null
  nextCount = 0
  deleteError = null
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('uyeService', () => {
  it('list — proje_id yoksa ApiError.badRequest', async () => {
    await expect(uyeService.list({})).rejects.toBeInstanceOf(ApiError)
  })

  it('create — proje_id yoksa ApiError.badRequest', async () => {
    await expect(uyeService.create({ ad: 'A', soyad: 'B' })).rejects.toBeInstanceOf(ApiError)
  })

  it('create — fn_create_member_atomic RPC çağrılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'u1', ad: 'A', soyad: 'B' }, error: null })
    await uyeService.create({ proje_id: PROJE, ad: 'A', soyad: 'B' }, 'actor-1')
    expect(rpcMock).toHaveBeenCalledWith('fn_create_member_atomic', {
      p_member_data: expect.objectContaining({ proje_id: PROJE }),
      p_actor_id: 'actor-1',
    })
  })

  it('create — 23505 dup → ApiError.conflict', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    await expect(uyeService.create({ proje_id: PROJE, ad: 'A' })).rejects.toThrow(/zaten kayıtlı/)
  })

  it('update — fn_update_member_atomic RPC proje_id ile çağrılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'u1' }, error: null })
    await uyeService.update('u1', { ad: 'C' }, PROJE, 'actor-1')
    expect(rpcMock).toHaveBeenCalledWith('fn_update_member_atomic', expect.objectContaining({
      p_member_id: 'u1',
      p_proje_id: PROJE,
      p_actor_id: 'actor-1',
    }))
  })

  it('update — IDOR: projeId boşsa 400 (RPC çağrılmaz)', async () => {
    await expect(uyeService.update('u1', { ad: 'C' }, '')).rejects.toBeInstanceOf(ApiError)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('update — IDOR: yabancı proje üyesi → RPC NULL → 404', async () => {
    // RPC proje_id guard'ı eşleşmezse NULL döner; service 404'e çevirir.
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    await expect(uyeService.update('u1', { ad: 'C' }, PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('update — 23505 dup → ApiError.conflict', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    await expect(uyeService.update('u1', { uye_no: 'U1' }, PROJE)).rejects.toThrow(/zaten kayıtlı/)
  })

  it('delete (soft) — durum=pasif update', async () => {
    nextData = { id: 'u1', durum: 'pasif' }
    const r = await uyeService.delete('u1', PROJE)
    expect(r.durum).toBe('pasif')
  })

  it('delete — IDOR: projeId boşsa 400', async () => {
    await expect(uyeService.delete('u1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('getById — IDOR: projeId boşsa 400', async () => {
    await expect(uyeService.getById('u1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('getAidatlar — IDOR: proje_id query parametresi zorunlu', async () => {
    await expect(uyeService.getAidatlar('u1', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('matchPaymentsFIFO — fn_match_member_payments_fifo RPC çağrılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: { matched: 3 }, error: null })
    await uyeService.matchPaymentsFIFO('u1', PROJE, 'actor-1')
    expect(rpcMock).toHaveBeenCalledWith('fn_match_member_payments_fifo', {
      p_proje_id: PROJE,
      p_uye_id: 'u1',
      p_actor_id: 'actor-1',
    })
  })
})

describe('blokService', () => {
  it('delete — 23503 FK → ApiError.badRequest', async () => {
    nextData = { id: 'b1' }  // pre-check geçsin
    deleteError = { code: '23503' }
    await expect(blokService.delete('b1', PROJE)).rejects.toThrow(/atanmış üyeler/)
  })

  it('delete — IDOR: projeId boşsa 400', async () => {
    await expect(blokService.delete('b1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('delete — IDOR: kayıt başka projede → 404', async () => {
    nextData = null  // pre-check yok
    await expect(blokService.delete('b1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('update — IDOR: projeId boşsa 400', async () => {
    await expect(blokService.update('b1', { blok_adi: 'B' }, '')).rejects.toBeInstanceOf(ApiError)
  })

  it('create — başarılı insert', async () => {
    nextData = { id: 'b1', blok_adi: 'A Blok' }
    nextError = null
    const r = await blokService.create({ blok_adi: 'A Blok', toplam_daire: 10 })
    expect(r.blok_adi).toBe('A Blok')
  })
})
