# Code Review — REV-FIFO-04

**Reviewer:** Master (self-review)
**Branch:** fix/fifo-realloc-durum-rozeti
**Tarih:** 2026-05-12

## Kapsam

7 dosya değişti / eklendi (FIFO bug fix scope'una göre filtrelenmiş):

1. `supabase/migrations/20260512000009_fifo_realloc_and_durum_view_aligned.sql` (yeni)
2. `server/src/services/uye.service.ts`
3. `server/src/controllers/uye.controller.ts`
4. `server/src/routes/uyeler.routes.ts`
5. `server/tests/integration/reallocPaymentsFifo.test.ts` (yeni)
6. `client/src/pages/uyeler/UyeDetailPage.tsx`
7. `client/e2e/fifo-realloc-durum.spec.ts` (yeni)

Diğer dosyalardaki (FirmaListPage, MalzemeTeslimListPage, UyeListPage, HakedisListPage, FaturaListPage, HeaderActionsToolbar, playwright-report) staged-olmayan değişiklikler bu PR'a dahil edilmedi — UI responsive sprint'in açık unstaged çalışmasıdır.

## Review notları

### Migration (20260512000009)
- `fn_realloc_member_payments_fifo` idempotent. Aynı RPC tekrar çağrılırsa zarar vermez (detach + FIFO yeniden çalışır, sonuç değişmez).
- View formülü ile birebir hizalı (`katsayi_tutari * serefiye_orani + faiz_yansitildi ? gecikme_faizi : 0`).
- Trigger fonksiyonu (`fn_sync_aidat_status_on_payment`) cari `alacak - borc` yerine artık view formülünü kullanıyor. Mevcut bireysel payment akışları da bu trigger'dan geçtiği için, yeni ödeme kayıtlarında durum doğru hesaplanacak.
- `fn_recompute_aidat_durum` reusable helper olarak yazıldı; başka yerlerden de çağrılabilir.
- `EXCEPTION` clause ile rollback garantisi; transactional.
- `fn_assert_aidat_durum_invariant` test/debug için invariant kontrol helper'ı; production-side bir guard değil (RETURN BOOLEAN, exception fırlatmaz).

### Backend
- Endpoint `/api/uyeler/:id/realloc-payments` admin-only (`requireRole('admin')`). Geçmiş allocation'ları manipüle ettiği için staff yetkisine açılmadı. Doğru karar.
- `reallocPaymentsFIFO` service fn `proje_id` guard'ı var; eksikse 400 döner.
- Error logger açık (`logger.error`).
- Type-check temiz.

### Frontend
- Durum rozeti artık `kalan_borc` + `son_odeme_tarihi` üzerinden derived. View'dan gelen `durum` kolonu artık sadece fallback. Bu defensive bir tasarım; DB ile UI sapsa bile UI tutarlı kalır.
- Yeni durum: `KISMİ` (sarı). Önceki UI bunu desteklemiyordu — `ÖDENDİ` (kalan=0) vs `BEKLİYOR/GECİKTİ` (ödeme yok) arası 3. state eklendi.
- Realloc butonu `Popconfirm` ile sarılı; yanlışlıkla tıklamayı önler.
- Mutation success'te `invalidateAllPaymentCaches()` çağrısı tüm üyeyle ilgili query'leri invalidate eder.
- Type-check temiz.

### Testler
- Server integration test: 5/5 pass. RBAC (admin/staff/anon), schema validation (proje_id eksik), error propagation kapsanmış.
- Full server suite: 63/63 pass — regression yok.
- Playwright spec: 2 smoke test (R1: buton görünür, R2: kalan>0 satırda ÖDENDİ etiketi yok). Side-effect oluşturmaz; gerçek realloc çağrısı yapmaz.

## Riskler

1. **Realloc, mevcut "split pair" kayıtlarını birleştirmez.** FIFO RPC daha önce bir ödemeyi 2'ye böldüyse (cari_hareketler'de 2 ayrı row), bu fix sadece kaynak_tipi'lerini NULL yapar; row'lar birleşmez. Yeni FIFO çağrısı yeniden bölebilir. Bu davranış intentional (idempotent + audit trail korunur).
2. **Çok sayıda aidatı olan üyelerde realloc yavaş olabilir** — her aidat için `fn_recompute_aidat_durum` çağrılıyor (loop). ~50-100 aidat üzerinde test edilmeli; daha fazlasında batch UPDATE'e geçilebilir.
3. **`fn_assert_aidat_durum_invariant` çağrılmıyor üretimde** — sadece test/debug için. Üretim invariant ihlali oluşursa logla alarm tetiklenmez. Bu, ileride monitoring hook'una bağlanabilir.

## Verdict

LGTM. Diff küçük, scope dar, side-effect kontrolü iyi, test coverage yeterli. Merge'e hazır.
