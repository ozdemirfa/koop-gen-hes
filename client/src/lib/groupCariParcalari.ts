// Sprint 20260519-para-hareketleri-improvements / US-3:
//
// FIFO eşleştirme (`fn_match_member_payments_fifo`) bir tahsilatı N aidat tahakkukuna
// eşleştirirken `cari_hareketler` tablosundaki orijinal satırı parçalıyor → para
// hareketleri sayfaları aynı tahsilatı N kez gösteriyor. Bu helper, aynı
// (tarih, odeme_turu, banka_hesap_id, belge_no, aciklama, islem_turu) anahtarına
// sahip parça satırları tek satıra konsolide eder.
//
// Davranış:
//   - `borc` ve `alacak` parça toplamlarına eşitlenir.
//   - `_parcaIds` parça id listesini, `_parcaCount` parça sayısını saklar.
//   - Tekil (parçalanmamış) satırlar için `_parcaCount=1`, `_parcaIds=[row.id]`.
//   - `kaynak_id` parçalardan herhangi birinde varsa grup matched sayılır
//     (UyeDetailPage REV-PAY-14 pattern'iyle aynı).
//   - Sıralama korunur: grouping fetched data üzerinde uygulanır, UI sıralaması sonra.
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
  borc?: number | null
  alacak?: number | null
  kaynak_id?: string | null
}

export type GroupKey = Array<keyof CariParcaRow>

export type GroupedRow<T> = T & {
  _parcaIds: string[]
  _parcaCount: number
}

const DEFAULT_KEY_FIELDS: GroupKey = [
  'tarih',
  'odeme_turu',
  'banka_hesap_id',
  'belge_no',
  'aciklama',
  'islem_turu',
]

export function groupCariParcalari<T extends CariParcaRow>(
  rows: T[] | null | undefined,
  keyFields: GroupKey = DEFAULT_KEY_FIELDS,
): GroupedRow<T>[] {
  if (!rows || rows.length === 0) return []

  const groups = new Map<string, GroupedRow<T>>()
  for (const row of rows) {
    const key = keyFields.map((f) => (row[f] ?? '') as string | number | boolean).join('|')
    const existing = groups.get(key)
    if (existing) {
      existing.borc = Number(existing.borc || 0) + Number(row.borc || 0)
      existing.alacak = Number(existing.alacak || 0) + Number(row.alacak || 0)
      existing._parcaIds.push(row.id)
      existing._parcaCount = existing._parcaIds.length
      // Parçalardan biri matched ise grup matched sayılır (UyeDetailPage REV-PAY-14 pattern)
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
