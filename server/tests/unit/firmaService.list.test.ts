// Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #6 + perf)
// firmaService.list eski Promise.all N+1 (her firma icin 3 query) yerine
// fn_firma_bakiye_batch RPC'sini tek cagriyla kullaniyor. 50 firma listesi
// icin: eski 150+ query, yeni 1 from + 1 rpc. Silent catch kaldirildi —
// RPC fail → throw.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

const buildListBuilder = (rows: any[], count: number) => {
  const b: any = {}
  b.select = () => b
  b.eq = () => b
  b.ilike = () => b
  b.order = () => b
  b.range = async () => ({ data: rows, error: null, count })
  return b
}

let currentBuilder: any

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => currentBuilder,
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { firmaService } from '../../src/services/firma.service'

describe('firmaService.list — bakiye RPC batch (P1 + perf)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
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

    const result = await firmaService.list({
      proje_id: '11111111-1111-4111-a111-111111111111',
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock.mock.calls[0][0]).toBe('fn_firma_bakiye_batch')
    expect(rpcMock.mock.calls[0][1].p_firma_ids).toHaveLength(50)
    expect(result.data).toHaveLength(50)
    expect(result.data[0].guncel_bakiye).toBe(600) // 1000 - 400
    expect(result.data[0].toplam_teminat).toBe(200)
  })

  it('bos firma listesi → RPC cagrilmaz', async () => {
    currentBuilder = buildListBuilder([], 0)
    const result = await firmaService.list({})
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

    await expect(firmaService.list({})).rejects.toMatchObject({
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

    const result = await firmaService.list({})
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

  it('proje_id "null" string → null olarak gonderilir', async () => {
    const firmalar = [{ id: 'aaaa1111-1111-4111-a111-111111111111', unvan: 'X' }]
    currentBuilder = buildListBuilder(firmalar, 1)
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await firmaService.list({ proje_id: 'null' })
    expect(rpcMock.mock.calls[0][1].p_proje_id).toBeNull()
  })
})
