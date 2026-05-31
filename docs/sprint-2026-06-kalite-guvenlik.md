# Sprint Planı — Kalite, Güvenlik, Performans & Temizlik

**Tarih:** 2026-05-31
**Kaynak:** Çok-ajanlı denetim (master = yapı, reviewer = kod/güvenlik/perf, qa = test)
**Baz commit:** `398db0a` (#173)

---

## Yönetici Özeti

Kod tabanı genel olarak sağlıklı: net monorepo katmanlaması, 489 geçen server testi, tsc temiz, başarılı build. Ancak üç kritik eksen var:

1. **Güvenlik:** Sistemik `SECURITY DEFINER` + `search_path` eksikliği (RLS bypass vektörü) ve en az bir IDOR (üye güncelleme) prod-öncesi kapatılmalı.
2. **Test boşlukları:** Kritik iş mantığı (aidat borçlandırma, hakediş onayı, yönetim huzur hakkı, şerefiye) büyük ölçüde testsiz; client neredeyse hiç unit test yok; ESLint CI'da fail edecek durumda (58 error).
3. **Hijyen:** gitignore'a rağmen tracked artifact'lar + Vite scaffold kalıntıları + araç-spesifik kök dosyaları.

**Sprint hedefi:** Prod-kritik güvenlik açıklarını kapatmak, sprint'te dokunulan kodu test altına almak, CI lint'i yeşile çekmek ve repo hijyenini düzeltmek.

---

## P0 — Güvenlik (prod-öncesi zorunlu)

### SEC-1 — SECURITY DEFINER fonksiyonlarına `search_path` ekle  🔴 KRİTİK
- **Kaynak:** reviewer
- **Sorun:** `SECURITY DEFINER` fonksiyonlar (`search_path` pinlenmemiş) sistemik RLS bypass / privilege escalation vektörü. Saldırgan `search_path`'i manipüle ederek fonksiyonun beklediği nesneleri gölgeleyebilir.
- **Dosyalar:** `supabase/migrations/20260520000010_role_v2_expand.sql:66-104` (RLS helper'lar) + repodaki TÜM `SECURITY DEFINER` fonksiyonlar (auto-owner trigger, RPC'ler dahil).
- **Düzeltme:** Her `SECURITY DEFINER` fonksiyona `SET search_path = public, pg_temp` ekle (yeni migration; `CREATE OR REPLACE` ile).
- **Kabul:** `grep` ile tüm SECURITY DEFINER fn'ler `search_path` içeriyor; migration deploy + smoke E2E yeşil.
- **Tahmin:** M

### SEC-2 — Üye güncelleme IDOR'u (RPC'de proje_id guard yok)  🔴 KRİTİK
- **Kaynak:** reviewer
- **Sorun:** Üye atomic update RPC'si proje_id sahiplik kontrolü yapmıyor → başka projenin üyesi güncellenebilir (IDOR).
- **Dosyalar:** `supabase/migrations/20260512000001_member_atomic_cinsiyet.sql`, `server/src/services/uye.service.ts:107-123`, `server/src/controllers/uye.controller.ts:31-34`.
- **Düzeltme:** RPC'ye `proje_id` parametresi + WHERE guard; service katmanında aktif proje doğrulaması; başka proje id → 404.
- **Kabul:** Yeni unit/integration test — yabancı proje üyesi update → 404; aynı proje → 200.
- **Tahmin:** M

### SEC-3 — Yönetim ödemesi banka_hesap proje izolasyonu  🟠 YÜKSEK
- **Kaynak:** reviewer
- **Sorun:** `fn_yonetim_payment_unified.sql:94-99` banka_hesap seçiminde proje izolasyonunu tam doğrulamıyor olabilir → başka projenin banka hesabına işlem.
- **Dosya:** `supabase/migrations/20260531140001_fn_yonetim_payment_unified.sql:94-99`.
- **Düzeltme:** banka_hesap'ın `proje_id`'sinin işlemin projesiyle eşleştiğini guard et.
- **Kabul:** Test — yabancı proje banka_hesap_id → hata.
- **Tahmin:** S

### SEC-4 — CORS yapılandırmasını sıkılaştır  🟡 ORTA
- **Kaynak:** reviewer
- **Dosya:** `server/src/index.ts:30-31`.
- **Düzeltme:** Origin allowlist (env tabanlı), `credentials` ile uyumlu; wildcard varsa kaldır.
- **Kabul:** İzinsiz origin reddedilir; prod origin geçer.
- **Tahmin:** S

---

## P1 — Test Kapsamı (sprint'te dokunulan + kritik iş mantığı)

### TEST-1 — `yonetimEkibi.service.ts` unit testleri  🔴
- **Kaynak:** qa | **Durum:** 115 satır, **0 test**; PR #169 son sprint'te değiştirdi.
- **Kapsam:** `list/create/update/delete/createPayment` (mock `fn_create_yonetim_payment_atomic`) + IDOR guard.
- **Tahmin:** M

### TEST-2 — `hakedis.service.ts` approve/unapprove testleri  🔴
- **Kaynak:** qa | Onayda toplam/teminat/stopaj yeniden hesabı, `taslak` değilse 400, IDOR guard.
- **Tahmin:** M

### TEST-3 — `aidat.service.ts` borçlandırma testleri  🔴
- **Kaynak:** qa | `chargeTanim`/`unchargeTanim`/`executeCharging`/`deleteAidat`/`recordPayment` — RPC mock başarı/hata + IDOR.
- **Not:** #173 ile oto-borçlandırma kaldırıldı; manuel akış test altına alınmalı.
- **Tahmin:** L

### TEST-4 — `proje.service.ts` şerefiye testleri  🟠
- **Kaynak:** qa | `generateSerefiye/import/export/sync/reset` — aidat dağılımının temeli, testsiz.
- **Tahmin:** M

### TEST-5 — Client `api.ts` interceptor + `usePermissions` testleri  🟠
- **Kaynak:** qa | proje_id enjeksiyonu, 401→/login; `canEdit/canDelete/isOfflineRestricted` (PR #160).
- **Tahmin:** M

---

## P1 — Kalite (CI'yı kıran + render riski)

### QUAL-1 — ESLint hatalarını temizle (CI fail ediyor)  🔴
- **Kaynak:** qa | **58 error + 223 warning**; `--max-warnings=0` ile CI fail.
- **Alt kalemler:** ~30 `no-unused-vars`, 4 `react-refresh/only-export-components`, 1 `no-non-null-asserted-optional-chain` (crash riski).
- **Tahmin:** M

### QUAL-2 — `setState-in-effect` render döngüsü riskini gider  🟠
- **Kaynak:** qa + reviewer | 7 ihlal, 5 dosya: `HeaderSearchPortal`, `CariEkstrePage`, `OdemeKayit`, `FirmaListPage`, `HakedisDetailPage`.
- **Düzeltme:** `useEffect`→state güncellemesini guard/türetilmiş state ile çöz.
- **Tahmin:** M

### QUAL-3 — React memoization uyarıları (react-compiler)  🟡
- **Kaynak:** qa | `KullaniciYonetimiPage`, `MizanPage`, `UyeBorcRaporPage` — useMemo/useCallback derlenemiyor.
- **Tahmin:** S

---

## P2 — Performans

### PERF-1 — AntD bundle splitting  🟡
- **Kaynak:** qa | antd chunk >800 KB. Manual chunks / dynamic import ile böl.
- **Tahmin:** S

### PERF-2 — N+1 / eksik index taraması  🟡
- **Kaynak:** reviewer | Server service'lerde N+1 sorgu ve sık filtrelenen kolonlarda index denetimi.
- **Tahmin:** M

---

## P2 — E2E Sağlığı (sahte-yeşil temizliği)

### E2E-1 — Kalıcı/koşullu skip'leri denetle  🟠
- **Kaynak:** qa
- `invitation-flow.spec.ts:36` — issue #78 kapandı mı? Skip kaldır ya da issue referansı + tarih.
- `form-validation-regression.spec.ts` (104/115/190/212/220) + `fifo-realloc-durum.spec.ts` — data-conditional `test.skip` → sabit fixture (beforeAll) ile değiştir; aksi halde sahte yeşil.
- `role-system-v2.spec.ts` — 3 skip, seed bağımlı.
- **Tahmin:** M

### E2E-2 — Para-banka hareketleri yönetim ödemesi E2E'si  🟡
- **Kaynak:** qa | PR #169 entegrasyonunu doğrulayan E2E yok.
- **Tahmin:** S

---

## P3 — Yapısal Temizlik & Hijyen

> Detaylar ve risk seviyeleri aşağıdaki "Temizlik" bölümünde. Güvenli olanlar bu sprint'te uygulanır; yargı gerektirenler kullanıcı onayıyla.

### CLEAN-1 — Tracked artifact'ları untrack et (güvenli)
- `git rm --cached client/playwright-report/index.html` + `workspace/` (39 dosya) — gitignore'da zaten var, kural eklenmeden önce commit edilmiş.

### CLEAN-2 — Vite scaffold kalıntılarını sil (güvenli, 0 referans teyitli)
- `client/src/App.css`, `client/src/assets/react.svg`, `client/src/assets/vite.svg`.

### CLEAN-3 — Tek-seferlik/yıkıcı SQL script'lerini arşivle
- `supabase/scripts/delete_firmalar_all.sql` (yıkıcı) → `supabase/scripts/_archive/` veya `-- ARCHIVED` başlığı.
- `supabase/scripts/audit_uyelik_baslangic_cari_hesap.sql` — kullanılmıyorsa arşivle.

### CLEAN-4 — Dökümantasyon konsolidasyonu (yargı gerektirir)
- `GEMINI.md` (değerli muhasebe kuralları) → `docs/business-rules.md`.
- `.roomodes` — Roo Code kullanılmıyorsa sil.
- `client/src/components/common/RoleGatedButton.tsx` — orphan; ileride kullanılmayacaksa sil.

---

## Önerilen Sprint Sırası
1. **P0 güvenlik (SEC-1..4)** — prod-kritik, önce.
2. **QUAL-1 ESLint** — CI'yı yeşile çek (diğer işlerin önünü açar).
3. **TEST-1..3** — sprint'te dokunulan koda regresyon koruması.
4. **CLEAN-1..2** — güvenli hijyen (hızlı kazanç, paralel yürütülebilir).
5. **QUAL-2, TEST-4..5, PERF, E2E, CLEAN-3..4** — kapasiteye göre.

**Tahmin lejantı:** S ≈ <0.5 gün, M ≈ 0.5–1 gün, L ≈ 1–2 gün.
