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

  // 20260525160000 — Rapor hesaplama revizyonu (formul degisikligi service shape'e
  // yansiyor — yeni semantik alanlar oncelikli + fallback'li okunur).

  it('aylikRapor — RPC yeni semantik alanlari oncelikli okunur (formul revizyonu sonrasi)', async () => {
    // RPC body simulasyonu: toplam_tahakkuk artik aidat + gecikme + uyelik_baslangic;
    // toplam_gider_tahakkuku artik hakedis + iade_odeme (fatura yok).
    rpcMock.mockResolvedValueOnce({
      data: {
        gelirler: [
          { id: 'g1', islem_turu: 'aidat_kayit', alacak: 1000 },
          { id: 'g2', islem_turu: 'gecikme_faizi', alacak: 50 },
          { id: 'g3', islem_turu: 'uyelik_baslangic', alacak: 5000, kaynak_tipi: null },
        ],
        giderler: [
          { id: 'h1', islem_turu: 'hakedis', borc: 2000, alacak: 0 },
          { id: 'i1', islem_turu: 'iade_odeme', borc: 0, alacak: 800 },
        ],
        tahsilatlar: [],
        odemeler: [],
        toplam_gelir: 6050,
        toplam_tahakkuk: 6050,
        toplam_gider: 2800,
        toplam_gider_tahakkuku: 2800,
        toplam_tahsilat: 0,
        toplam_odeme: 0,
      },
      error: null,
    })
    const r = await raporService.aylikRapor(2026, 5, PROJE)
    expect(r.toplam_tahakkuk).toBe(6050)
    expect(r.toplam_gider_tahakkuku).toBe(2800)
    // Deprecated alias'lar service tarafindan yeni degerlerle yansitilir
    expect(r.toplam_gelir).toBe(6050)
    expect(r.toplam_gider).toBe(2800)
    // Listeler dogrudan dondurulur
    expect(r.gelirler).toHaveLength(3)
    expect(r.giderler).toHaveLength(2)
    expect((r.giderler as any[]).some(g => g.islem_turu === 'iade_odeme')).toBe(true)
    expect((r.giderler as any[]).some(g => g.islem_turu === 'fatura')).toBe(false)
  })

  it('yillikRapor — RPC formul revizyonu sonrasi toplam alanlari ve aylik enrichment', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        yil: 2026,
        aylik: [
          { ay: 1, gelir: 1500, tahakkuk: 1500, gider: 800, gider_tahakkuku: 800, tahsilat: 1200, odeme: 600 },
          { ay: 2, gelir: 2000, tahakkuk: 2000, gider: 1000, gider_tahakkuku: 1000, tahsilat: 1800, odeme: 700 },
        ],
        toplam_gelir: 3500,
        toplam_tahakkuk: 3500,
        toplam_gider: 1800,
        toplam_gider_tahakkuku: 1800,
        toplam_tahsilat: 3000,
        toplam_odeme: 1300,
      },
      error: null,
    })
    // aidat_detaylari empty mock
    const fromMock = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }))
    // @ts-ignore
    ;(await import('../../src/config/supabase')).supabaseAdmin.from = fromMock as any

    const r = await raporService.yillikRapor(2026, PROJE)
    expect(r.toplam_tahakkuk).toBe(3500)
    expect(r.toplam_gider_tahakkuku).toBe(1800)
    // Aylik enrichment yeni alanlari korur
    expect(r.aylik[0].tahakkuk).toBe(1500)
    expect(r.aylik[0].gider_tahakkuku).toBe(800)
    // Deprecated alias'lar
    expect(r.aylik[0].gelir).toBe(1500)
    expect(r.aylik[0].gider).toBe(800)
  })
})
