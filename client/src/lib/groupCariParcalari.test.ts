import { describe, it, expect } from 'vitest'
import { groupCariParcalari, type CariParcaRow } from './groupCariParcalari'

// Test edilen davranış:
//  1) FIFO parçaları (aynı cari + tarih + yöntem + açıklama + işlem türü) tek satıra
//     konsolide olur, tutarlar toplanır, _parcaIds/_parcaCount dolar.
//  2) REGRESYON (2026-05-30 bugfix): farklı cari'lere ait satırlar — diğer tüm alanlar
//     aynı olsa bile — ASLA birleşmez. Aksi halde proje geneli Para Hareketleri
//     listesinde farklı üyelerin `uyelik_baslangic` tahsilatları ilk üyenin adıyla
//     ve toplanmış tutarla tek satırda görünüyordu.

const base: Omit<CariParcaRow, 'id' | 'cari_hesap_id'> = {
  tarih: '2026-05-30',
  odeme_turu: 'banka',
  banka_hesap_id: 'bank-1',
  belge_no: null,
  aciklama: null,
  islem_turu: 'uyelik_baslangic',
}

describe('groupCariParcalari', () => {
  it('aynı cari için FIFO parçalarını tek satıra konsolide eder ve tutarları toplar', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: 'cari-A', borc: 100, alacak: 0 },
      { ...base, id: 'p2', cari_hesap_id: 'cari-A', borc: 250, alacak: 0 },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(1)
    expect(result[0].borc).toBe(350)
    expect(result[0]._parcaCount).toBe(2)
    expect(result[0]._parcaIds).toEqual(['p1', 'p2'])
  })

  it('REGRESYON: farklı cari hesaplarına ait satırları birleştirmez', () => {
    // İki ayrı üyenin, diğer tüm alanları birebir aynı olan başlangıç bedeli tahsilatı.
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: 'cari-A', borc: 2_356_246, alacak: 0 },
      { ...base, id: 'p2', cari_hesap_id: 'cari-B', borc: 100_000, alacak: 0 },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(2)
    const byCari = Object.fromEntries(result.map((r) => [r.cari_hesap_id, r]))
    expect(byCari['cari-A'].borc).toBe(2_356_246)
    expect(byCari['cari-B'].borc).toBe(100_000)
    // Her satır kendi tek parçasını taşır — toplama/karışma yok.
    expect(byCari['cari-A']._parcaIds).toEqual(['p1'])
    expect(byCari['cari-B']._parcaIds).toEqual(['p2'])
  })

  it('parçalardan biri eşleşmişse (kaynak_id) grup matched sayılır', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: 'cari-A', borc: 100, kaynak_id: null },
      { ...base, id: 'p2', cari_hesap_id: 'cari-A', borc: 100, kaynak_id: 'aidat-1' },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(1)
    expect(result[0].kaynak_id).toBe('aidat-1')
  })

  it('tekil (parçalanmamış) satır _parcaCount=1 ile döner', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: 'cari-A', borc: 500 },
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

  it('açıklama/tarih farklıysa ayrı satırlar üretir (aynı cari içinde)', () => {
    const rows: CariParcaRow[] = [
      { ...base, id: 'p1', cari_hesap_id: 'cari-A', borc: 100, aciklama: 'Teminat İadesi' },
      { ...base, id: 'p2', cari_hesap_id: 'cari-A', borc: 100, aciklama: null },
    ]

    const result = groupCariParcalari(rows)

    expect(result).toHaveLength(2)
  })
})
