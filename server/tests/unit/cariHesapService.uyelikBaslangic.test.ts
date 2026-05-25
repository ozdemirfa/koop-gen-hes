// Sprint uyelik-baslangic-iptal-duzenle (2026-05-25)
// cariHesapService.updateUyelikBaslangicTahakkuk +
// cariHesapService.deleteUyelikBaslangicTahakkuk unit testleri.
//
// Migration 20260525170000:
//   fn_update_uyelik_baslangic_tahakkuk → P0001 (kapali / yanlis tip / validasyon)
//                                      → P0002 (kayit yok)
//   fn_delete_uyelik_baslangic_tahakkuk → ayni
//
// Service error mapping:
//   P0001 → ApiError.conflict (409, simetrik cariHesap.service.update guard)
//   P0002 → ApiError.notFound (404)
//   Diger → pass-through (errorHandler default 500/400)

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { cariHesapService } from '../../src/services/cariHesap.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
})

const TAHAKKUK_ID = 'aaaa1111-1111-4111-a111-111111111111'
const ACTOR_ID = 'bbbb1111-1111-4111-a111-222222222222'

describe('cariHesapService.updateUyelikBaslangicTahakkuk', () => {
  it('basarili update → RPC tek cagrildi, data doner', async () => {
    const ret = { id: TAHAKKUK_ID, alacak: 5000, tarih: '2026-05-25', aciklama: 'X' }
    rpcMock.mockResolvedValueOnce({ data: ret, error: null })

    const result = await cariHesapService.updateUyelikBaslangicTahakkuk(
      TAHAKKUK_ID,
      { tutar: 5000, tarih: '2026-05-25', aciklama: 'X' },
      ACTOR_ID,
    )

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('fn_update_uyelik_baslangic_tahakkuk', {
      p_id: TAHAKKUK_ID,
      p_tutar: 5000,
      p_tarih: '2026-05-25',
      p_aciklama: 'X',
      p_actor_id: ACTOR_ID,
    })
    expect(result).toEqual(ret)
  })

  it('aciklama undefined → RPC payload p_aciklama null', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: TAHAKKUK_ID }, error: null })

    await cariHesapService.updateUyelikBaslangicTahakkuk(
      TAHAKKUK_ID,
      { tutar: 1000, tarih: '2026-05-01' },
    )

    expect(rpcMock).toHaveBeenCalledWith('fn_update_uyelik_baslangic_tahakkuk', {
      p_id: TAHAKKUK_ID,
      p_tutar: 1000,
      p_tarih: '2026-05-01',
      p_aciklama: null,
      p_actor_id: null,
    })
  })

  it('P0001 (tahsilat bagi) → ApiError.conflict (409)', async () => {
    const pgErr = {
      code: 'P0001',
      message: 'Bu tahakkuka bagli tahsilatlar var. Once bagli tahsilatlari iptal edin.',
    }
    rpcMock.mockResolvedValueOnce({ data: null, error: pgErr })

    await expect(
      cariHesapService.updateUyelikBaslangicTahakkuk(TAHAKKUK_ID, {
        tutar: 1000,
        tarih: '2026-05-01',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('tahsilat'),
    })
  })

  it('P0002 (kayit yok) → ApiError.notFound (404)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Baslangic bedeli tahakkuku bulunamadi' },
    })

    const err = await cariHesapService
      .updateUyelikBaslangicTahakkuk(TAHAKKUK_ID, {
        tutar: 1000,
        tarih: '2026-05-01',
      })
      .catch((e: any) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(404)
  })

  it('beklenmedik error → pass-through', async () => {
    const err = { code: '42P01', message: 'relation does not exist' }
    rpcMock.mockResolvedValueOnce({ data: null, error: err })

    await expect(
      cariHesapService.updateUyelikBaslangicTahakkuk(TAHAKKUK_ID, {
        tutar: 1000,
        tarih: '2026-05-01',
      }),
    ).rejects.toMatchObject({ code: '42P01' })
  })
})

describe('cariHesapService.deleteUyelikBaslangicTahakkuk', () => {
  it('basarili silme → RPC tek cagrildi, success mesaji doner', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })

    const result = await cariHesapService.deleteUyelikBaslangicTahakkuk(TAHAKKUK_ID, ACTOR_ID)

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('fn_delete_uyelik_baslangic_tahakkuk', {
      p_id: TAHAKKUK_ID,
      p_actor_id: ACTOR_ID,
    })
    expect(result).toMatchObject({ success: true })
  })

  it('actorId undefined → p_actor_id null', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })

    await cariHesapService.deleteUyelikBaslangicTahakkuk(TAHAKKUK_ID)

    expect(rpcMock).toHaveBeenCalledWith('fn_delete_uyelik_baslangic_tahakkuk', {
      p_id: TAHAKKUK_ID,
      p_actor_id: null,
    })
  })

  it('P0001 (tahsilat bagi) → ApiError.conflict (409)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'Bu tahakkuka bagli tahsilatlar var. Once bagli tahsilatlari iptal edin.',
      },
    })

    await expect(cariHesapService.deleteUyelikBaslangicTahakkuk(TAHAKKUK_ID))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('P0002 (kayit yok) → ApiError.notFound (404)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'Baslangic bedeli tahakkuku bulunamadi' },
    })

    await expect(cariHesapService.deleteUyelikBaslangicTahakkuk(TAHAKKUK_ID))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
