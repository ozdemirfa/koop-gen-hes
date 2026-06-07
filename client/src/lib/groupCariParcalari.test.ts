import { describe, it, expect } from 'vitest'
import { groupCariParcalari, type CariParcaRow } from './groupCariParcalari'

// Test edilen davranış (AKILLI GRUPLAMA, 2026-06-07):
//  1) Aynı `parca_grup_id` taşıyan FIFO parçaları tek satıra konsolide olur, tutarlar
//     toplanır, _parcaIds/_parcaCount dolar.
//  2) `parca_grup_id` taşımayan (null) satırlar — diğer tüm alanları birebir aynı olsa
//     bile — ASLA birleşmez (yönetim ödemeleri cari_hesap_id=NULL, kurum ödemeleri,
//     parçalanmamış ayrı ödemeler). Her biri kendi satırı.

const base: Omit<CariParcaRow, 'id'> = {
  tarih: '2026-05-30',
  odeme_turu: 'banka',
  banka_hesap_id: 'bank-1',
  belge_no: null,
  aciklama: null,
  islem_turu: 'uyelik_baslangic',
  cari_hesap_id: 'cari-A',
}

describe('groupCariParcalari', () => {
  it('aynı parca_grup_id taşıyan FIFO parçalarını tek satıra konsolide eder', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', parca_grup_id: 'g-1', borc: 100, alacak: 0 },
      { ...base, id: 'p2', parca_grup_id: 'g-1', borc: 250, alacak: 0 },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(1)
    expect(result[0].borc).toBe(350)
    expect(result[0]._parcaCount).toBe(2)
    expect(result[0]._parcaIds).toEqual(['p1', 'p2'])
  })

  it('farklı parca_grup_id taşıyan satırları birleştirmez', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', parca_grup_id: 'g-1', borc: 100 },
      { ...base, id: 'p2', parca_grup_id: 'g-2', borc: 250 },
    ]

    const result = groupCariParcalari(rows)
    expect(result).toHaveLength(2)
  })

  it('parca_grup_id null ayrı girişleri birleştirmez (yönetim/kurum/ayrı ödeme)', () => {
    // Tüm alanları birebir aynı ama parca_grup_id null → her biri ayrı satır.
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: null, islem_turu: 'yonetim_odeme_banka_cikis', borc: 0, alacak: 5000 },
      { ...base, id: 'p2', cari_hesap_id: null, islem_turu: 'yonetim_odeme_banka_cikis', borc: 0, alacak: 5000 },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(2)
    expect(result[0]._parcaIds).toEqual(['p1'])
    expect(result[1]._parcaIds).toEqual(['p2'])
  })

  it('aynı parca_grup_id grubunda parçalardan biri eşleşmişse (kaynak_id) grup matched sayılır', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', parca_grup_id: 'g-1', borc: 100, kaynak_id: null },
      { ...base, id: 'p2', parca_grup_id: 'g-1', borc: 100, kaynak_id: 'aidat-1' },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(1)
    expect(result[0].kaynak_id).toBe('aidat-1')
  })

  it('tekil (parca_grup_id null) satır _parcaCount=1 ile döner', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', borc: 500 },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(1)
    expect(result[0]._parcaCount).toBe(1)
    expect(result[0]._parcaIds).toEqual(['p1'])
  })

  it('boş/null girdi için boş dizi döner', () => {
    expect(groupCariParcalari(null)).toEqual([])
    expect(groupCariParcalari(undefined)).toEqual([])
    expect(groupCariParcalari([])).toEqual([])
  })
})
