// Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #5)
// cariHesapService.delete eski iki-step (banka + cari) silmesi yerine
// fn_delete_cari_hareket_with_banka RPC'sini cagiriyor. P0001 (kapali kayit)
// errorHandler tarafindan 400'e, P0002 (kayit yok) service tarafinda
// ApiError.notFound (404) ile yakalanmali.
//
// security-quality-sprint 2026-05-26: delete(id, projeId) signature güncellendi.
// IDOR pre-check eklendi; from() artık çağrılıyor (select id, proje_id eşleşmesi).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
let preCheckResult: any = { id: 'x' }  // varsayılan: kayıt bulunsun

vi.mock('../../src/config/supabase', () => {
  const builder: any = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = async () => ({ data: preCheckResult, error: null })
  return {
    supabaseAdmin: {
      from: () => builder,
      rpc: (...args: any[]) => rpcMock(...args),
    },
  }
})

import { cariHesapService } from '../../src/services/cariHesap.service'
import { ApiError } from '../../src/utils/ApiError'

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('cariHesapService.delete (atomik RPC, P1 fix + IDOR sprint 2026-05-26)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    preCheckResult = { id: 'x' }
  })

  it('basarili silme → RPC tek cagrildi, success mesaji doner', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const result = await cariHesapService.delete('aaaa1111-1111-4111-a111-111111111111', PROJE)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('fn_delete_cari_hareket_with_banka', {
      p_id: 'aaaa1111-1111-4111-a111-111111111111',
    })
    expect(result.success).toBe(true)
  })

  it('P0001 (kapali kayit) → errorHandler tarafindan 400 yapilmasi icin error fırlatılır', async () => {
    const pgErr = { code: 'P0001', message: 'Bu tahsilat eslesti...' }
    rpcMock.mockResolvedValueOnce({ data: null, error: pgErr })
    await expect(
      cariHesapService.delete('bbbb1111-1111-4111-a111-111111111111', PROJE),
    ).rejects.toMatchObject({ code: 'P0001' })
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('P0002 (kayit yok) → ApiError.notFound (404)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Cari hareket bulunamadi' },
    })
    await expect(
      cariHesapService.delete('cccc1111-1111-4111-a111-111111111111', PROJE),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('IDOR: başka projedeki kayıt → 404 (RPC çağrılmaz)', async () => {
    preCheckResult = null  // pre-check: kayıt başka projede
    await expect(
      cariHesapService.delete('eeee1111-1111-4111-a111-111111111111', PROJE),
    ).rejects.toBeInstanceOf(ApiError)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('IDOR: projeId yoksa 400', async () => {
    await expect(
      cariHesapService.delete('ffff1111-1111-4111-a111-111111111111', ''),
    ).rejects.toBeInstanceOf(ApiError)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
