// Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #5)
// cariHesapService.delete eski iki-step (banka + cari) silmesi yerine
// fn_delete_cari_hareket_with_banka RPC'sini cagiriyor. P0001 (kapali kayit)
// errorHandler tarafindan 400'e, P0002 (kayit yok) service tarafinda
// ApiError.notFound (404) ile yakalanmali.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { cariHesapService } from '../../src/services/cariHesap.service'
import { ApiError } from '../../src/utils/ApiError'

describe('cariHesapService.delete (atomik RPC, P1 fix)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('basarili silme → RPC tek cagrildi, success mesaji doner', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const result = await cariHesapService.delete('aaaa1111-1111-4111-a111-111111111111')
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
      cariHesapService.delete('bbbb1111-1111-4111-a111-111111111111'),
    ).rejects.toMatchObject({ code: 'P0001' })
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('P0002 (kayit yok) → ApiError.notFound (404)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Cari hareket bulunamadi' },
    })
    await expect(
      cariHesapService.delete('cccc1111-1111-4111-a111-111111111111'),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('eski iki-step delete kaldirildi — supabaseAdmin.from cagirilmiyor', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    await cariHesapService.delete('dddd1111-1111-4111-a111-111111111111')
    // Eski kod 3 from() cagiriyordu (select + banka delete + cari delete);
    // simdi sadece rpc. From hic cagrilmamali.
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})
