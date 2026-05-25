// Sprint revizyon-bugfix-paketi B2 (2026-05-25, P0 multi-tenant veri sizintisi)
// firmaService.getCariEkstre proje_id parametresi yoksa eskiden tum projelerin
// cari hareketleri sizdiriyordu. Artik requireProjeId ile zorunlu kilinmis;
// yokken 400 ApiError firlatir. Bu testler:
//   1. proje_id yoksa hata
//   2. proje_id varsa eq('proje_id', ...) filter cagrilir
//   3. 'null'/'undefined' string'leri reddedilir
//   4. ekstre bakiyesi dogru hesaplanir

import { describe, it, expect, vi, beforeEach } from 'vitest'

const eqMock = vi.fn()
const orderMock = vi.fn()
const selectMock = vi.fn()

const buildEkstreBuilder = (rows: any[]) => {
  const b: any = {}
  b.select = (...args: any[]) => { selectMock(...args); return b }
  b.eq = (...args: any[]) => { eqMock(...args); return b }
  b.order = async (...args: any[]) => { orderMock(...args); return { data: rows, error: null } }
  return b
}

let currentBuilder: any

vi.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => currentBuilder,
  },
}))

import { firmaService } from '../../src/services/firma.service'

describe('firmaService.getCariEkstre — proje izolasyonu (B2 P0)', () => {
  beforeEach(() => {
    eqMock.mockReset()
    orderMock.mockReset()
    selectMock.mockReset()
  })

  it('proje_id yoksa 400 ApiError firlatir', async () => {
    currentBuilder = buildEkstreBuilder([])
    await expect(
      firmaService.getCariEkstre('aaaa1111-1111-4111-a111-111111111111'),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('proje_id bos string ise 400', async () => {
    currentBuilder = buildEkstreBuilder([])
    await expect(
      firmaService.getCariEkstre('aaaa1111-1111-4111-a111-111111111111', { proje_id: '' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("proje_id 'null' string ise 400", async () => {
    currentBuilder = buildEkstreBuilder([])
    await expect(
      firmaService.getCariEkstre('aaaa1111-1111-4111-a111-111111111111', { proje_id: 'null' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("proje_id 'undefined' string ise 400", async () => {
    currentBuilder = buildEkstreBuilder([])
    await expect(
      firmaService.getCariEkstre('aaaa1111-1111-4111-a111-111111111111', { proje_id: 'undefined' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('proje_id varsa firma_id + proje_id filtreleri uygulanir', async () => {
    const rows = [
      { tarih: '2026-01-01', alacak: 1000, borc: 0, aciklama: 'tahsilat' },
      { tarih: '2026-01-15', alacak: 0, borc: 400, aciklama: 'odeme' },
    ]
    currentBuilder = buildEkstreBuilder(rows)
    const result = await firmaService.getCariEkstre(
      'aaaa1111-1111-4111-a111-111111111111',
      { proje_id: '99999999-9999-4999-a999-999999999999' },
    )
    // eq cagrilari: firma_id + proje_id (2 kez)
    const calls = eqMock.mock.calls.map((c) => c[0])
    expect(calls).toContain('cari_hesaplar.firma_id')
    expect(calls).toContain('proje_id')
    const projeIdCall = eqMock.mock.calls.find((c) => c[0] === 'proje_id')
    expect(projeIdCall?.[1]).toBe('99999999-9999-4999-a999-999999999999')
    // Bakiye 1000 - 400 = 600
    expect(result.guncel_bakiye).toBe(600)
    expect(result.hareketler).toHaveLength(2)
  })

  it('bos sonuc kume → bakiye 0, hareketler []', async () => {
    currentBuilder = buildEkstreBuilder([])
    const result = await firmaService.getCariEkstre(
      'aaaa1111-1111-4111-a111-111111111111',
      { proje_id: '99999999-9999-4999-a999-999999999999' },
    )
    expect(result.guncel_bakiye).toBe(0)
    expect(result.hareketler).toEqual([])
  })
})
