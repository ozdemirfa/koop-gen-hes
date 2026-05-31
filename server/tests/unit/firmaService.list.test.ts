// Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #6 + perf)
// firmaService.list eski Promise.all N+1 (her firma icin 3 query) yerine
// fn_firma_bakiye_batch RPC'sini tek cagriyla kullaniyor. 50 firma listesi
// icin: eski 150+ query, yeni 1 from + 1 rpc. Silent catch kaldirildi —
// RPC fail → throw.
//
// Sprint firma-owner-scope (2026-05-31): list() artık owner-bazlı.
//   - proje_id ZORUNLU (requireProjeId; eksik/'null'/'undefined' → 400).
//   - getProjectOwnerId(proje_uyelikleri) ile projenin owner'ı bulunur;
//     firmalar `owner_id = ownerId` ile filtrelenir. Owner yoksa boş döner,
//     RPC çağrılmaz. Bu yüzden mock artık iki tabloyu (proje_uyelikleri +
//     firmalar) ayırt eder ve tüm list() çağrıları proje_id geçer.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

// proje_uyelikleri owner-lookup builder (getProjectOwnerId):
//   .select('user_id').eq('proje_id',..).eq('rol','owner').limit(1).maybeSingle()
const buildOwnerBuilder = () => {
  const b: any = {}
  b.select = () => b
  b.eq = () => b
  b.limit = () => b
  b.maybeSingle = async () => ({
    data: ownerUserId ? { user_id: ownerUserId } : null,
    error: null,
  })
  return b
}

// firmalar list builder: list() artık full set'i çekip (range YOK) servis
// katmanında sıralayıp slice ediyor; sonucu .order() resolve eder.
const buildListBuilder = (rows: any[], count: number) => {
  const b: any = {}
  b.select = () => b
  b.eq = () => b
  b.ilike = () => b
  b.order = async () => ({ data: rows, error: null, count })
  return b
}

let currentBuilder: any
let ownerUserId: string | null

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === 'proje_uyelikleri' ? buildOwnerBuilder() : currentBuilder,
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { firmaService } from '../../src/services/firma.service'

const PROJE_ID = '11111111-1111-4111-a111-111111111111'
const OWNER_ID = 'cccc1111-1111-4111-a111-111111111111'

describe('firmaService.list — owner-scope + bakiye RPC batch (P1 + perf)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    ownerUserId = OWNER_ID // default: projenin owner'ı var
  })

  it('50 firma icin tek RPC cagrisi (N+1 cozuldu)', async () => {
    const firmalar = Array.from({ length: 50 }, (_, i) => ({
      id: `aaaa1111-1111-4111-a111-${String(i).padStart(12, '0')}`,
      unvan: `Firma ${i}`,
    }))
    currentBuilder = buildListBuilder(firmalar, 50)
    rpcMock.mockResolvedValueOnce({
      data: firmalar.map((f) => ({
        firma_id: f.id,
        toplam_odeme: 1000,
        toplam_kdvli: 400,
        birikmis_teminat: 200,
      })),
      error: null,
    })

    // limit:50 → tek sayfada hepsi (RPC yine full set = 50 id ile çağrılır).
    const result = await firmaService.list({
      proje_id: PROJE_ID,
      limit: '50',
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock.mock.calls[0][0]).toBe('fn_firma_bakiye_batch')
    expect(rpcMock.mock.calls[0][1].p_firma_ids).toHaveLength(50)
    expect(rpcMock.mock.calls[0][1].p_proje_id).toBe(PROJE_ID)
    expect(result.data).toHaveLength(50)
    expect(result.data[0].guncel_bakiye).toBe(600) // 1000 - 400
    expect(result.data[0].toplam_teminat).toBe(200)
  })

  it('sort_by=fatura_acigi desc → açığa göre sıralar + fatura_acigi hesaplanır', async () => {
    const firmalar = [
      { id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'A' },
      { id: 'bbbb1111-1111-4111-a111-111111111111', unvan: 'B' },
    ]
    currentBuilder = buildListBuilder(firmalar, 2)
    rpcMock.mockResolvedValueOnce({
      data: [
        // A: fatura_acigi = 1000 - 400 = 600
        { firma_id: 'aaaa1111-1111-4111-a111-111111111111', toplam_odeme: 0, toplam_kdvli: 400, birikmis_teminat: 0, toplam_fatura: 1000 },
        // B: fatura_acigi = 5000 - 1000 = 4000 (daha büyük)
        { firma_id: 'bbbb1111-1111-4111-a111-111111111111', toplam_odeme: 0, toplam_kdvli: 1000, birikmis_teminat: 0, toplam_fatura: 5000 },
      ],
      error: null,
    })

    const result = await firmaService.list({ proje_id: PROJE_ID, sort_by: 'fatura_acigi', sort_dir: 'desc' })

    // desc → B (4000) önce, A (600) sonra
    expect(result.data[0].unvan).toBe('B')
    expect(result.data[0].fatura_acigi).toBe(4000)
    expect(result.data[1].unvan).toBe('A')
    expect(result.data[1].fatura_acigi).toBe(600)
  })

  it('bos firma listesi → RPC cagrilmaz', async () => {
    currentBuilder = buildListBuilder([], 0)
    const result = await firmaService.list({ proje_id: PROJE_ID })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
  })

  it('RPC hatasi sessiz dusurulmez — throw eder (P1 silent failure fix)', async () => {
    const firmalar = [{ id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'Test' }]
    currentBuilder = buildListBuilder(firmalar, 1)
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'RPC failed' },
    })

    await expect(firmaService.list({ proje_id: PROJE_ID })).rejects.toMatchObject({
      code: 'PGRST116',
    })
  })

  it('RPC sonucu eksik firma_id icin defaults (0,0)', async () => {
    const firmalar = [
      { id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'A' },
      { id: 'bbbb1111-1111-4111-a111-111111111111', unvan: 'B' },
    ]
    currentBuilder = buildListBuilder(firmalar, 2)
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          firma_id: 'aaaa1111-1111-4111-a111-111111111111',
          toplam_odeme: 500,
          toplam_kdvli: 300,
          birikmis_teminat: 100,
        },
      ],
      error: null,
    })

    const result = await firmaService.list({ proje_id: PROJE_ID })
    expect(result.data[0].guncel_bakiye).toBe(200) // A: 500-300
    expect(result.data[0].toplam_teminat).toBe(100)
    expect(result.data[1].guncel_bakiye).toBe(0) // B: RPC sonucunda yok → defaults
    expect(result.data[1].toplam_teminat).toBe(0)
  })

  it('proje_id parametresi RPC\'ye gecirilir', async () => {
    const firmalar = [{ id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'X' }]
    currentBuilder = buildListBuilder(firmalar, 1)
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await firmaService.list({ proje_id: '99999999-9999-4999-a999-999999999999' })
    expect(rpcMock.mock.calls[0][1].p_proje_id).toBe('99999999-9999-4999-a999-999999999999')
  })

  // Sprint firma-owner-scope (2026-05-31): proje_id artık zorunlu.
  it('proje_id eksik → 400 (owner-scope zorunlu)', async () => {
    await expect(firmaService.list({})).rejects.toMatchObject({ statusCode: 400 })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('proje_id "null" string → 400 (eksik sayılır)', async () => {
    await expect(firmaService.list({ proje_id: 'null' })).rejects.toMatchObject({ statusCode: 400 })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  // Sprint firma-owner-scope (2026-05-31): projenin owner'ı yoksa
  // gösterilecek firma yok → boş liste, firmalar sorgusu + RPC çalışmaz.
  it('owner bulunamazsa boş liste döner — RPC cagrilmaz', async () => {
    ownerUserId = null
    currentBuilder = buildListBuilder([{ id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'X' }], 1)
    const result = await firmaService.list({ proje_id: PROJE_ID })
    expect(result.data).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
