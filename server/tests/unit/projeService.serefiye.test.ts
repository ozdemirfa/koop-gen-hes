// Sprint kalite-guvenlik-2026-06 (TEST-4):
//   proje.service şerefiye metodları — aidat dağılımının temeli, testsizdi.
//   exportSerefiye / importSerefiye / generateSerefiye / syncSerefiye /
//   resetSerefiye / getSerefiye.
//
// Mock: tablo-bazlı response kuyrukları (from(table) → builder; terminal
//   single/maybeSingle/await sıradaki yanıtı tablonun kuyruğundan tüketir;
//   count head sorguları da await ile çözülür) + rpc adına göre yanıt.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const queues: Record<string, any[]> = {}
const rpcCalls: Array<{ name: string; args: any }> = []
const rpcResponses: Record<string, { data: any; error: any }> = {}

function resp(table: string) {
  const arr = queues[table] || []
  return arr.length ? arr.shift() : { data: null, error: null }
}

vi.mock('../../src/config/supabase', () => {
  function makeBuilder(table: string) {
    const b: any = {}
    ;['select', 'eq', 'in', 'order', 'limit', 'update', 'insert', 'delete', 'is', 'not'].forEach(
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

import { projeService } from '../../src/services/proje.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k]
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k]
  rpcCalls.length = 0
})

describe('projeService.exportSerefiye', () => {
  it('BOM + Proje Adı başlığı + header + satırlar üretir', async () => {
    queues.projeler = [{ data: { proje_adi: 'Test Sitesi' }, error: null }]
    queues.serefiye_tablosu = [
      { data: [{ daire_no: 'A.1', kat: 1, yon: 'Güney', m2: 100, oda_sayisi: '3+1', serefiye_orani: 1.05 }], error: null },
    ]
    const csv = await projeService.exportSerefiye(PROJE)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Proje Adı: Test Sitesi')
    expect(csv).toContain('daire_no,kat,yon,m2,oda_sayisi,serefiye_orani')
    expect(csv).toContain('A.1,1,Güney,100,3+1,1.05')
  })

  it('proje adı yoksa başlık satırı eklenmez', async () => {
    queues.projeler = [{ data: null, error: null }]
    queues.serefiye_tablosu = [{ data: [], error: null }]
    const csv = await projeService.exportSerefiye(PROJE)
    expect(csv).not.toContain('Proje Adı:')
    expect(csv).toContain('daire_no,kat,yon,m2,oda_sayisi,serefiye_orani')
  })

  it('serefiye sorgu hatası → throw', async () => {
    queues.projeler = [{ data: null, error: null }]
    queues.serefiye_tablosu = [{ data: null, error: { message: 'boom' } }]
    await expect(projeService.exportSerefiye(PROJE)).rejects.toBeTruthy()
  })
})

describe('projeService.importSerefiye', () => {
  it('daire_no başlığı yoksa 400', async () => {
    const buf = Buffer.from('foo,bar\n1,2\n', 'utf8')
    await expect(projeService.importSerefiye(PROJE, buf)).rejects.toBeInstanceOf(ApiError)
  })

  it('geçerli CSV → fn_import_serefiye_bulk RPC parse edilmiş satırlarla çağrılır', async () => {
    rpcResponses['fn_import_serefiye_bulk'] = { data: { updated: 2, failed: 0, total: 2 }, error: null }
    const csv = 'daire_no,kat,yon,m2,oda_sayisi,serefiye_orani\nA.1,1,Güney,100,3+1,1.05\nA.2,2,Kuzey,90,2+1,0.95\n'
    const r = await projeService.importSerefiye(PROJE, Buffer.from(csv, 'utf8'))
    expect(rpcCalls[0].name).toBe('fn_import_serefiye_bulk')
    expect(rpcCalls[0].args.p_proje_id).toBe(PROJE)
    expect(rpcCalls[0].args.p_rows).toHaveLength(2)
    expect(rpcCalls[0].args.p_rows[0]).toMatchObject({ daire_no: 'A.1', kat: 1, serefiye_orani: 1.05 })
    expect(r).toEqual({ updated: 2, failed: 0, total: 2 })
  })

  it('TR ondalık (virgül) + noktalı-virgül ayraç toleransı', async () => {
    rpcResponses['fn_import_serefiye_bulk'] = { data: { updated: 1, failed: 0, total: 1 }, error: null }
    // Excel TR: "Proje Adı" başlığı + semicolon delimiter + virgüllü ondalık
    const csv = 'Proje Adı: X\n\ndaire_no;kat;yon;m2;oda_sayisi;serefiye_orani\nB.1;3;Doğu;85,5;1+1;1,25\n'
    await projeService.importSerefiye(PROJE, Buffer.from(csv, 'utf8'))
    const row = rpcCalls[0].args.p_rows[0]
    expect(row.serefiye_orani).toBeCloseTo(1.25)
    expect(row.m2).toBeCloseTo(85.5)
  })

  it('RPC hatası → throw', async () => {
    rpcResponses['fn_import_serefiye_bulk'] = { data: null, error: { code: '23505', message: 'dup' } }
    const csv = 'daire_no,serefiye_orani\nA.1,1\n'
    await expect(projeService.importSerefiye(PROJE, Buffer.from(csv, 'utf8'))).rejects.toBeTruthy()
  })
})

describe('projeService.generateSerefiye', () => {
  it('mevcut kayıt varsa 400 (conflict)', async () => {
    queues.serefiye_tablosu = [{ count: 5, error: null }] // existing count > 0
    await expect(projeService.generateSerefiye(PROJE)).rejects.toBeInstanceOf(ApiError)
  })

  it('bloklardan doğru daire sayısı üretir', async () => {
    queues.serefiye_tablosu = [
      { count: 0, error: null }, // existing yok
      { data: null, error: null }, // insert ok
    ]
    queues.bloklar = [
      {
        data: [
          { id: 'b1', blok_adi: 'A', toplam_daire: 3, daire_baslangic_no: 1 },
          { id: 'b2', blok_adi: 'B', toplam_daire: 2, daire_baslangic_no: 1 },
        ],
        error: null,
      },
    ]
    const r = await projeService.generateSerefiye(PROJE)
    expect(r.generated).toBe(5) // 3 + 2
  })
})

describe('projeService.syncSerefiye', () => {
  it('yalnız eksik daireleri ekler', async () => {
    queues.bloklar = [
      { data: [{ id: 'b1', blok_adi: 'A', toplam_daire: 3, daire_baslangic_no: 1 }], error: null },
    ]
    queues.serefiye_tablosu = [
      { data: [{ blok_id: 'b1', daire_sira_no: 1 }], error: null }, // mevcut: A.1
      { data: null, error: null }, // insert ok
    ]
    const r = await projeService.syncSerefiye(PROJE)
    expect(r.added).toBe(2) // 3 daire - 1 mevcut = 2
  })
})

describe('projeService.resetSerefiye', () => {
  it('reset_serefiye_table RPC çağrılır + sonuç döner', async () => {
    rpcResponses['reset_serefiye_table'] = { data: 10, error: null }
    const r = await projeService.resetSerefiye(PROJE)
    expect(rpcCalls[0]).toEqual({ name: 'reset_serefiye_table', args: { p_proje_id: PROJE } })
    expect(r.generated).toBe(10)
  })

  it('dolu daireler hatası → 400', async () => {
    rpcResponses['reset_serefiye_table'] = { data: null, error: { message: 'Tabloda dolu daireler var' } }
    await expect(projeService.resetSerefiye(PROJE)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('projeService.getSerefiye', () => {
  it('blok_adi sonra daire_sira_no\'ya göre sıralar', async () => {
    queues.serefiye_tablosu = [
      {
        data: [
          { id: '3', daire_sira_no: 2, bloklar: { blok_adi: 'B' } },
          { id: '1', daire_sira_no: 1, bloklar: { blok_adi: 'A' } },
          { id: '2', daire_sira_no: 2, bloklar: { blok_adi: 'A' } },
        ],
        error: null,
      },
    ]
    const r = await projeService.getSerefiye(PROJE)
    expect(r.map((x: any) => x.id)).toEqual(['1', '2', '3']) // A.1, A.2, B.2
  })
})
