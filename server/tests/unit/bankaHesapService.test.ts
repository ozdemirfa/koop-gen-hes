// Sprint qa-review-bugfix-faz3 Batch 3 — bankaHesap.service unit testleri

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let nextData: any = null
let nextError: any = null
let insertArgs: any[] = []

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gte = () => builder
  builder.lte = () => builder
  builder.insert = (rows: any) => {
    insertArgs.push(rows)
    return builder
  }
  builder.update = () => builder
  builder.order = () => Promise.resolve({ data: nextData, error: nextError })
  builder.single = async () => ({ data: nextData, error: nextError })
  builder.then = (resolve: any) => resolve({ data: nextData, error: nextError })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { bankaHesapService } from '../../src/services/bankaHesap.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
  nextData = null
  nextError = null
  insertArgs = []
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('bankaHesapService', () => {
  it('listHesaplar — proje_id zorunlu', async () => {
    await expect(bankaHesapService.listHesaplar({})).rejects.toBeInstanceOf(ApiError)
  })

  it('listHesaplar — fn_banka_hesaplari_with_bakiye RPC kullanılır (N+1 fix)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ id: '1', banka_adi: 'XYZ', bakiye: '1234.50' }],
      error: null,
    })
    const r = await bankaHesapService.listHesaplar({ proje_id: PROJE })
    expect(rpcMock).toHaveBeenCalledWith('fn_banka_hesaplari_with_bakiye', { p_proje_id: PROJE })
    expect(r[0].bakiye).toBe(1234.5) // NUMERIC → Number coercion
  })

  it('listHesaplar — RPC hatası throw eder', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '42P01' } })
    await expect(bankaHesapService.listHesaplar({ proje_id: PROJE })).rejects.toMatchObject({
      code: '42P01',
    })
  })

  it('createHesap — insert payload\'ı geçirir', async () => {
    nextData = { id: '1', banka_adi: 'ZBank' }
    const r = await bankaHesapService.createHesap({ banka_adi: 'ZBank', proje_id: PROJE })
    expect(insertArgs[0][0].banka_adi).toBe('ZBank')
    expect(r).toEqual(nextData)
  })

  it('updateHesap — kayıt yok → ApiError.notFound', async () => {
    nextData = null
    nextError = null
    await expect(bankaHesapService.updateHesap('xx', { banka_adi: 'A' })).rejects.toBeInstanceOf(ApiError)
  })

  it('listHareketler — proje_id zorunlu', async () => {
    await expect(bankaHesapService.listHareketler({})).rejects.toBeInstanceOf(ApiError)
  })
})
