// Sprint kalite-guvenlik-2026-06 (TEST-3):
//   Aidat borçlandırma akışları — chargeTanim / unchargeTanim / executeCharging /
//   deleteAidat / recordPayment. #173 ile oto-borçlandırma kaldırıldı, manuel akış
//   test altında değildi. Mevcut aidatService.test.ts yalnız tanım CRUD + updateAidatRow
//   kapsıyordu.
//
// Mock: tablo-bazlı response kuyrukları (from(table) → builder, terminal sıradaki
//   yanıtı tükettir) + rpc adına göre yanıt. recordPayment cariHesapService.createPayment
//   çağırdığı için o modül de mock'lanır.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const queues: Record<string, any[]> = {}
const rpcCalls: Array<{ name: string; args: any }> = []
const rpcResponses: Record<string, { data: any; error: any }> = {}
const createPaymentMock = vi.fn()

function resp(table: string) {
  const arr = queues[table] || []
  return arr.length ? arr.shift() : { data: null, error: null }
}

vi.mock('../../src/config/supabase', () => {
  function makeBuilder(table: string) {
    const b: any = {}
    ;['select', 'eq', 'in', 'order', 'limit', 'update', 'insert', 'delete', 'is', 'not', 'or', 'ilike'].forEach(
      (m) => (b[m] = () => b)
    )
    b.single = () => Promise.resolve(resp(table))
    b.maybeSingle = () => Promise.resolve(resp(table))
    b.then = (resolve: any) => resolve(resp(table))
    return b
  }
  return {
    supabaseAdmin: {
      from: (t: string) => makeBuilder(t),
      rpc: async (name: string, args: any) => {
        rpcCalls.push({ name, args })
        return rpcResponses[name] ?? { data: null, error: null }
      },
    },
  }
})

vi.mock('../../src/services/cariHesap.service', () => ({
  cariHesapService: { createPayment: (...args: any[]) => createPaymentMock(...args) },
}))

import { aidatTanimiService, aidatService } from '../../src/services/aidat.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k]
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k]
  rpcCalls.length = 0
  createPaymentMock.mockReset()
})

describe('aidatTanimiService.chargeTanim', () => {
  it('fn_charge_aidat_tanimi çağrılır + sonuç döner', async () => {
    rpcResponses['fn_charge_aidat_tanimi'] = { data: { success: true, count: 12 }, error: null }
    const r = await aidatTanimiService.chargeTanim('t1', 'actor-1')
    expect(rpcCalls[0]).toEqual({ name: 'fn_charge_aidat_tanimi', args: { p_tanim_id: 't1', p_actor_id: 'actor-1' } })
    expect(r.count).toBe(12)
  })

  it('RPC error → throw', async () => {
    rpcResponses['fn_charge_aidat_tanimi'] = { data: null, error: { message: 'boom' } }
    await expect(aidatTanimiService.chargeTanim('t1')).rejects.toBeTruthy()
  })

  it('data.success === false → 400', async () => {
    rpcResponses['fn_charge_aidat_tanimi'] = { data: { success: false, message: 'zaten borçlandırıldı' }, error: null }
    await expect(aidatTanimiService.chargeTanim('t1')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('aidatTanimiService.unchargeTanim', () => {
  it('projeId boşsa 400', async () => {
    await expect(aidatTanimiService.unchargeTanim('t1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('IDOR: tanım başka projede → 404 (RPC çağrılmaz)', async () => {
    queues.aidat_tanimlari = [{ data: null, error: null }]
    await expect(aidatTanimiService.unchargeTanim('t1', PROJE)).rejects.toBeInstanceOf(ApiError)
    expect(rpcCalls).toHaveLength(0)
  })

  it('ödeme eşleşmesi varsa P0001 → 409', async () => {
    queues.aidat_tanimlari = [{ data: { id: 't1' }, error: null }]
    rpcResponses['fn_uncharge_aidat_tanimi'] = { data: null, error: { code: 'P0001', message: 'ödeme var' } }
    await expect(aidatTanimiService.unchargeTanim('t1', PROJE)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('başarılı → RPC sonucu döner', async () => {
    queues.aidat_tanimlari = [{ data: { id: 't1' }, error: null }]
    rpcResponses['fn_uncharge_aidat_tanimi'] = { data: { success: true }, error: null }
    const r = await aidatTanimiService.unchargeTanim('t1', PROJE, 'actor-1')
    expect(rpcCalls[0]).toEqual({ name: 'fn_uncharge_aidat_tanimi', args: { p_tanim_id: 't1', p_actor_id: 'actor-1' } })
    expect(r.success).toBe(true)
  })
})

describe('aidatTanimiService.executeCharging', () => {
  it('tarih + actor ile RPC çağrılır', async () => {
    rpcResponses['fn_execute_aidat_charging'] = { data: { charged: 3 }, error: null }
    const r = await aidatTanimiService.executeCharging('2026-06-01', 'actor-1')
    expect(rpcCalls[0]).toEqual({
      name: 'fn_execute_aidat_charging',
      args: { p_date: '2026-06-01', p_actor_id: 'actor-1' },
    })
    expect(r.charged).toBe(3)
  })

  it('RPC error → throw', async () => {
    rpcResponses['fn_execute_aidat_charging'] = { data: null, error: { message: 'fail' } }
    await expect(aidatTanimiService.executeCharging()).rejects.toBeTruthy()
  })
})

describe('aidatService.deleteAidat', () => {
  it('projeId boşsa 400', async () => {
    await expect(aidatService.deleteAidat('a1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('IDOR: aidat başka projede → 404 (RPC çağrılmaz)', async () => {
    queues.aidat_detaylari = [{ data: null, error: null }]
    await expect(aidatService.deleteAidat('a1', PROJE)).rejects.toBeInstanceOf(ApiError)
    expect(rpcCalls).toHaveLength(0)
  })

  it('ödeme eşleşmesi varsa P0001 → 409', async () => {
    queues.aidat_detaylari = [{ data: { id: 'a1' }, error: null }]
    rpcResponses['fn_delete_aidat_row'] = { data: null, error: { code: 'P0001', message: 'ödeme var' } }
    await expect(aidatService.deleteAidat('a1', PROJE)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('başarılı → RPC sonucu döner', async () => {
    queues.aidat_detaylari = [{ data: { id: 'a1' }, error: null }]
    rpcResponses['fn_delete_aidat_row'] = { data: { success: true }, error: null }
    const r = await aidatService.deleteAidat('a1', PROJE, 'actor-1')
    expect(rpcCalls[0]).toEqual({ name: 'fn_delete_aidat_row', args: { p_aidat_id: 'a1', p_actor_id: 'actor-1' } })
    expect(r.success).toBe(true)
  })
})

describe('aidatService.recordPayment', () => {
  it('projeId boşsa 400', async () => {
    await expect(aidatService.recordPayment('a1', { tutar: 100 }, '')).rejects.toBeInstanceOf(ApiError)
  })

  it('aidat yoksa 404', async () => {
    queues.aidat_detaylari = [{ data: null, error: null }]
    await expect(aidatService.recordPayment('a1', { tutar: 100 }, PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('zaten ödenmiş aidat → 400', async () => {
    queues.aidat_detaylari = [{ data: { id: 'a1', durum: 'odendi', proje_id: PROJE, uye_id: 'u1' }, error: null }]
    await expect(aidatService.recordPayment('a1', { tutar: 100 }, PROJE)).rejects.toThrow(/zaten ödenmiş/)
  })

  it('cari hesap yoksa → 400', async () => {
    queues.aidat_detaylari = [{ data: { id: 'a1', durum: 'bekliyor', proje_id: PROJE, uye_id: 'u1' }, error: null }]
    queues.cari_hesaplar = [{ data: null, error: null }]
    await expect(aidatService.recordPayment('a1', { tutar: 100 }, PROJE)).rejects.toThrow(/cari hesap/i)
  })

  it('tam ödeme → durum odendi + createPayment çağrılır', async () => {
    queues.aidat_detaylari = [
      { data: { id: 'a1', durum: 'bekliyor', proje_id: PROJE, uye_id: 'u1', ay: 6, yil: 2026, hesaplanan_tutar: 1000 }, error: null }, // get
      { data: { toplam_borc: 1000 }, error: null }, // vAidat
    ]
    queues.cari_hesaplar = [{ data: { id: 'c1' }, error: null }]
    queues.cari_hareketler = [{ data: [{ borc: 1000 }], error: null }] // toplam ödenen = 1000
    queues.aidatlar = [{ data: { id: 'a1', durum: 'odendi' }, error: null }] // update sonucu
    createPaymentMock.mockResolvedValueOnce({ id: 'ch1' })

    const r = await aidatService.recordPayment('a1', { tutar: 1000, odeme_yontemi: 'banka' }, PROJE, 'actor-1')

    expect(createPaymentMock).toHaveBeenCalledTimes(1)
    const payArg = createPaymentMock.mock.calls[0][0]
    expect(payArg.kaynak_tipi).toBe('aidat')
    expect(payArg.kaynak_id).toBe('a1')
    expect(payArg.tutar).toBe(1000)
    expect((r as any).durum).toBe('odendi')
  })

  it('kısmi ödeme → durum değişmez (bekliyor kalır)', async () => {
    queues.aidat_detaylari = [
      { data: { id: 'a1', durum: 'bekliyor', proje_id: PROJE, uye_id: 'u1', ay: 6, yil: 2026, hesaplanan_tutar: 1000 }, error: null },
      { data: { toplam_borc: 1000 }, error: null },
    ]
    queues.cari_hesaplar = [{ data: { id: 'c1' }, error: null }]
    queues.cari_hareketler = [{ data: [{ borc: 400 }], error: null }] // kısmi: 400 < 1000
    queues.aidatlar = [{ data: { id: 'a1', durum: 'bekliyor' }, error: null }]
    createPaymentMock.mockResolvedValueOnce({ id: 'ch1' })

    const r = await aidatService.recordPayment('a1', { tutar: 400 }, PROJE)
    expect((r as any).durum).toBe('bekliyor')
  })
})
