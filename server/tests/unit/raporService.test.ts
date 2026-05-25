// Sprint qa-review-bugfix-faz3 Batch 3 — rapor.service unit testleri
// dispatcher pattern — her metod requireProjeId + RPC çağrısı.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}))

import { raporService } from '../../src/services/rapor.service'
import { ApiError } from '../../src/utils/ApiError'

beforeEach(() => {
  rpcMock.mockReset()
})

const PROJE = 'a1111111-1111-4111-a111-111111111111'

describe('raporService', () => {
  it('dashboardOzet — proje_id zorunlu', async () => {
    await expect(raporService.dashboardOzet('')).rejects.toBeInstanceOf(ApiError)
  })

  it('dashboardOzet — fn_dashboard_ozet RPC + tarih null normalize', async () => {
    rpcMock.mockResolvedValueOnce({ data: { kasa: 1000 }, error: null })
    await raporService.dashboardOzet(PROJE, '', '')
    expect(rpcMock).toHaveBeenCalledWith('fn_dashboard_ozet', {
      p_proje_id: PROJE,
      p_baslangic: null,
      p_bitis: null,
    })
  })

  it('dashboardOzet — tarihler set ise aktarılır', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    await raporService.dashboardOzet(PROJE, '2026-01-01', '2026-12-31')
    expect(rpcMock.mock.calls[0][1].p_baslangic).toBe('2026-01-01')
    expect(rpcMock.mock.calls[0][1].p_bitis).toBe('2026-12-31')
  })

  it('aidatDurumu — defaults ile merge (bekliyor/odendi/gecikti/iptal)', async () => {
    rpcMock.mockResolvedValueOnce({ data: { odendi: 5 }, error: null })
    const r = await raporService.aidatDurumu(PROJE)
    expect(r).toEqual({ bekliyor: 0, odendi: 5, gecikti: 0, iptal: 0 })
  })

  it('getMizan — RPC sonucu Number() ile cast edilir', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          cari_hesap_id: 'c1',
          cari_adi: 'X',
          cari_turu: 'firma',
          toplam_alacak: '100.50',
          toplam_borc: '50.25',
          bakiye: '50.25',
        },
      ],
      error: null,
    })
    const r = await raporService.getMizan(PROJE)
    expect(r[0].toplam_alacak).toBe(100.5)
    expect(r[0].bakiye).toBe(50.25)
  })

  it('RPC hatası throw eder', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '42P01' } })
    await expect(raporService.dashboardOzet(PROJE)).rejects.toMatchObject({ code: '42P01' })
  })
})
