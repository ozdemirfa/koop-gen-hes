// Para hareketleri gösterim konsolidasyonu.
//
// FIFO eşleştirme (`fn_match_member_payments_fifo`) bir tahsilatı N tahakkuka eşleştirirken
// `cari_hareketler` tablosundaki orijinal satırı parçalar → aynı ödeme N satır olur. Bu
// helper, AYNI ödemeden türeyen parçaları tek satıra konsolide eder.
//
// AKILLI GRUPLAMA (2026-06-07): Konsolidasyon yalnız `parca_grup_id` üzerinden yapılır.
// FIFO bölmesi tek ödemeden türeyen tüm parçalara ortak `parca_grup_id` damgalar
// (migration 20260607000009). `parca_grup_id` taşımayan satırlar (yönetim ödemeleri
// cari_hesap_id=NULL, kurum ödemeleri, parçalanmamış ayrı ödemeler) ASLA birleşmez — her
// biri kendi satırı. Önceki (cari_hesap_id+tarih+...) heuristiği, aynı alanlı ayrı girişleri
// yanlışlıkla birleştirdiği için kaldırıldı.
//
// Davranış:
//   - `borc`/`alacak` grup parçalarının toplamına eşitlenir.
//   - `_parcaIds` parça id listesi, `_parcaCount` parça sayısı.
//   - parca_grup_id null satırlar: `_parcaCount=1`, `_parcaIds=[row.id]`.
//   - `kaynak_id` parçalardan birinde varsa grup matched sayılır.
//
// Test: `groupCariParcalari.test.ts`.

export interface CariParcaRow {
  id: string
  tarih?: string | null
  odeme_turu?: string | null
  banka_hesap_id?: string | null
  belge_no?: string | null
  aciklama?: string | null
  islem_turu?: string | null
  cari_hesap_id?: string | null
  parca_grup_id?: string | null
  borc?: number | null
  alacak?: number | null
  kaynak_id?: string | null
}

export type GroupedRow<T> = T & {
  _parcaIds: string[]
  _parcaCount: number
}

export function groupCariParcalari<T extends CariParcaRow>(
  rows: T[] | null | undefined,
): GroupedRow<T>[] {
  if (!rows || rows.length === 0) return []

  const groups = new Map<string, GroupedRow<T>>()
  for (const row of rows) {
    // Yalnız parca_grup_id paylaşan FIFO parçaları birleşir; aksi halde her satır tekildir.
    const key = row.parca_grup_id ? `g:${row.parca_grup_id}` : `i:${row.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.borc = Number(existing.borc || 0) + Number(row.borc || 0)
      existing.alacak = Number(existing.alacak || 0) + Number(row.alacak || 0)
      existing._parcaIds.push(row.id)
      existing._parcaCount = existing._parcaIds.length
      if (row.kaynak_id && !existing.kaynak_id) {
        existing.kaynak_id = row.kaynak_id
      }
    } else {
      groups.set(key, {
        ...row,
        _parcaIds: [row.id],
        _parcaCount: 1,
      })
    }
  }
  return Array.from(groups.values())
}
