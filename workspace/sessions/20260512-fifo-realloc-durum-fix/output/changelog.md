# CHANGELOG — 2026-05-12 (REV-FIFO-04)

## Bug Fix: FIFO Yeniden Dağıt + Durum Rozeti Tutarlılığı

### Yeni Özellik

- **FIFO Yeniden Dağıt butonu** (Üye Detay sayfası, admin-only):
  Bir üyenin tüm aidat-bağlı ödemelerini sıfırlar ve vade sırasına göre yeniden dağıtır.
  Geçmişte yanlış parçalanmış kapama hatalarını düzeltir.

### Davranış Değişikliği

- **Aidat Hesapları durum rozeti** artık `kalan_borc + son_odeme_tarihi` üzerinden hesaplanır
  (önceki: view'daki `durum` kolonu doğrudan kullanılıyordu). Yeni rozetler:
  - `ÖDENDİ` (yeşil) — kalan = 0
  - `KISMİ` (sarı, **yeni**) — 0 < kalan < tahakkuk
  - `GECİKTİ` (kırmızı) — kalan = tahakkuk ve vade geçmiş
  - `BEKLİYOR` (mavi) — kalan = tahakkuk ve vade gelmemiş

### Bug Fix

- **FIFO ihlali düzeltildi.** Eskiden, eski tarihli aidatlar parçalı ödenmişken
  yeni tarihli aidatlar tam ödenmiş kalabilirdi (FIFO sadece yeni ödemeleri eşleştiriyordu,
  geçmiş hataları düzeltmiyordu). Artık admin "FIFO Yeniden Dağıt" ile geçmişi de düzeltebilir.
- **Durum etiketi tutarsızlığı düzeltildi.** `aidatlar.durum = 'odendi'` iken
  `kalan_borc > 0` durumu oluşamayacak — trigger fonksiyonu (`fn_sync_aidat_status_on_payment`)
  artık view formülüyle birebir aynı hesabı kullanıyor (önceki: cari alacak-borc; yeni: formula tahakkuk vs cari paid).

### Teknik

- Yeni migration: `20260512000009_fifo_realloc_and_durum_view_aligned.sql`
  - `fn_realloc_member_payments_fifo(proje_id, uye_id, actor_id?)` — idempotent realloc RPC
  - `fn_recompute_aidat_durum(aidat_id)` — view-aligned tek aidat durum hesap helper'ı
  - `fn_assert_aidat_durum_invariant(proje_id, uye_id)` — debug/test invariant kontrolü
  - `fn_sync_aidat_status_on_payment` view-aligned versiyon
- Yeni endpoint: `POST /api/uyeler/:id/realloc-payments?proje_id=...` (admin-only)
- Test: 5 yeni integration test + 2 Playwright smoke test
