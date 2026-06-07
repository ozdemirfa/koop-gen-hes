// Sprint kalite-guvenlik-2026-06 (TEST-2):
//   hakedisService.approve / unapprove — onayda toplam/teminat/stopaj yeniden
//   hesabı (güvenlik recompute), durum guard'ları, IDOR (proje_id), cari hareket
//   + huzur hakkı RPC entegrasyonu ve hata rollback'i. Mevcut hakedisService.test.ts
//   yalnız list/getById kapsıyordu.
//
// Mock: tablo-bazlı response kuyrukları. from(table) → o tabloya bağlı builder;
//   terminal (maybeSingle/single/await) sıradaki yanıtı tablonun kuyruğundan
//   tüketir. update/insert payload'ları global olarak kaydedilir.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const queues: Record<string, any[]> = {}
const updateCalls: Array<{ table: string; payload: any }> = []
const insertCalls: Array<{ table: string; rows: any }> = []
const rpcCalls: Array<{ name: string; args: any }> = []
const rpcResponses: Record<string, { data: any; error: any }> = {}

function resp(table: string) {
  const arr = queues[table] || []
  return arr.length ? arr.shift() : { data: null, error: null }
}

vi.mock('../../src/config/supabase', () => {
  function makeBuilder(table: string) {
    const b: any = {}
    ;['select', 'eq', 'in', 'order', 'limit'].forEach((m) => (b[m] = () => b))
    b.update = (payload: any) => {
      updateCalls.push({ table, payload })
      return b
    }
    b.insert = (rows: any) => {
      insertCalls.push({ table, rows })
      return b
    }
    b.delete = () => b
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

import { hakedisService } from '../../src/services/hakedis.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k]
  updateCalls.length = 0
  insertCalls.length = 0
  rpcCalls.length = 0
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k]
})

// Yardımcı: taslak hakediş (1 kalem: 10 × 100 = 1000 ara, %20 KDV = 200 → toplam 1200)
function taslakHakedis(overrides: any = {}) {
  return {
    id: 'h1',
    hakedis_no: 1,
    proje_id: PROJE,
    durum: 'taslak',
    diger_kesintiler: 0,
    sozlesmeler: { firma_id: null, teminat_orani: 10, stopaj_orani: 5 },
    hakedis_kalemleri: [{ bu_ay_miktar: 10, birim_fiyat: 100, kdv_orani: 20 }],
    ...overrides,
  }
}

describe('hakedisService.approve', () => {
  it('projeId boşsa 400', async () => {
    await expect(hakedisService.approve('h1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('hakediş yoksa 404', async () => {
    queues.hakedisler = [{ data: null, error: null }]
    await expect(hakedisService.approve('h1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('durum taslak değilse 400', async () => {
    queues.hakedisler = [{ data: taslakHakedis({ durum: 'onaylandi' }), error: null }]
    await expect(hakedisService.approve('h1', PROJE)).rejects.toThrow(/taslak/)
  })

  it('güvenlik recompute: ara/kdv/teminat/stopaj/net doğru hesaplanır', async () => {
    queues.hakedisler = [
      { data: taslakHakedis(), error: null }, // get
      { data: { id: 'h1', hakedis_toplam: 1200 }, error: null }, // update sonucu
    ]

    await hakedisService.approve('h1', PROJE)

    const upd = updateCalls.find((c) => c.table === 'hakedisler' && c.payload.durum === 'onaylandi')
    expect(upd).toBeTruthy()
    expect(upd!.payload.ara_toplam).toBe(1000)
    expect(upd!.payload.kdv_tutar).toBe(200)
    expect(upd!.payload.hakedis_toplam).toBe(1200)
    expect(upd!.payload.teminat_kesintisi).toBe(100) // 1000 × %10
    expect(upd!.payload.stopaj_kesintisi).toBe(50) // 1000 × %5
    expect(upd!.payload.net_tutar).toBe(1050) // 1200 - 100 - 50
    // firma_id null → cari hareket yazılmaz.
    expect(insertCalls.find((c) => c.table === 'cari_hareketler')).toBeUndefined()
    // Rev 2 (2026-06-07): huzur hakkı artık hakkediş onayında DAĞITILMAZ (ödeme bazlı trigger).
    expect(rpcCalls.map((c) => c.name)).not.toContain('fn_yonetim_huzur_hakki_dagit')
  })

  it('firma varsa: cari hareket yazılır (huzur hakkı artık ödeme bazlı)', async () => {
    queues.hakedisler = [
      { data: taslakHakedis({ sozlesmeler: { firma_id: 'f1', teminat_orani: 0, stopaj_orani: 0 } }), error: null },
      { data: { id: 'h1', hakedis_toplam: 1200 }, error: null },
    ]
    queues.cari_hesaplar = [{ data: { id: 'c1' }, error: null }]
    queues.cari_hareketler = [{ data: null, error: null }] // insert ok

    await hakedisService.approve('h1', PROJE)

    const ins = insertCalls.find((c) => c.table === 'cari_hareketler')
    expect(ins).toBeTruthy()
    expect(ins!.rows[0].borc).toBe(1200)
    expect(ins!.rows[0].kaynak_tipi).toBe('hakedis')
    // Rev 2: onay artık huzur hakkı dağıtmaz.
    expect(rpcCalls.map((c) => c.name)).not.toContain('fn_yonetim_huzur_hakki_dagit')
  })

  it('firma var ama cari hesap yoksa → 400', async () => {
    queues.hakedisler = [
      { data: taslakHakedis({ sozlesmeler: { firma_id: 'f1', teminat_orani: 0, stopaj_orani: 0 } }), error: null },
      { data: { id: 'h1', hakedis_toplam: 1200 }, error: null },
    ]
    queues.cari_hesaplar = [{ data: null, error: null }] // cari yok
    await expect(hakedisService.approve('h1', PROJE)).rejects.toThrow(/cari hesap/i)
  })
})

describe('hakedisService.unapprove', () => {
  it('projeId boşsa 400', async () => {
    await expect(hakedisService.unapprove('h1', '')).rejects.toBeInstanceOf(ApiError)
  })

  it('hakediş yoksa 404', async () => {
    queues.hakedisler = [{ data: null, error: null }]
    await expect(hakedisService.unapprove('h1', PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('durum onaylandı değilse 400', async () => {
    queues.hakedisler = [{ data: { id: 'h1', durum: 'taslak' }, error: null }]
    await expect(hakedisService.unapprove('h1', PROJE)).rejects.toThrow(/onaylı/)
  })

  it('onaylıyı taslağa çeker: cari silinir + durum taslak (huzur iptal artık ödeme bazlı)', async () => {
    queues.hakedisler = [
      { data: { id: 'h1', durum: 'onaylandi' }, error: null }, // get
      { data: { id: 'h1', durum: 'taslak' }, error: null }, // update
    ]
    queues.cari_hareketler = [{ data: null, error: null }] // delete ok

    const r = await hakedisService.unapprove('h1', PROJE)

    // Rev 2 (2026-06-07): onay-iptalde huzur hakkı iptal RPC çağrılmaz (ödeme bazlı).
    expect(rpcCalls.map((c) => c.name)).not.toContain('fn_yonetim_huzur_hakki_iptal')
    const upd = updateCalls.find((c) => c.table === 'hakedisler')
    expect(upd!.payload.durum).toBe('taslak')
    expect(upd!.payload.onay_tarihi).toBeNull()
    expect((r as any).durum).toBe('taslak')
  })
})
