# Backlog — koopGenHes

**Son güncelleme:** 2026-05-11 (gece — Sprint Closure tamamlandı, 14 P3 task kapatıldı)
**Bir sonraki çalışma:** 2026-05-12 (yarın)

Bu dosya günden güne kalan işleri biriktirir. Yarın açıp buradan devam.

---

## 🔴 Hemen yapılacak — Doğrulama / Manuel Adımlar

### 1. ✅ Migration deploy'ları — TAMAMLANDI

Bugün deploy edilen migration'lar (`supabase migration list` ile remote = local):
- `20260511000003` 13 RPC actor_id pattern
- `20260511000004` firm_fifo actor_id pattern
- `20260511000005` audit_logs RLS policy COMMENT
- `20260511000006` `fn_audit_proje_id_nulls` RPC
- `20260511000007` 12 tabloda `proje_id SET NOT NULL`

RPC imza doğrulaması da otomatik yapıldı; kalan tek manuel adım: gerçek kullanıcı işlemiyle audit doğrulaması (bkz §3).

### 2. Vercel preview UI testi (UI responsive sprint sonrası + OdemeKayit refactor)

Commit `36d893d` + `b077eee` ile gelen fix'leri 3 viewport'ta doğrula:

- **1920×1080 (desktop):** Header'da "Yeni X" butonlarının text'i tüm sayfalarda görünüyor mu?
- **768×1024 (tablet):** Aynı kontrol.
- **375×667 (mobile):** Modal'lar tam ekran sığıyor mu, `width="min(520px, 95vw)"` çalışıyor mu?

Kapsayacak sayfalar: Aidat Tanımları, Üye Yönetimi, Hakedişler, Faturalar, Banka Hesapları, Malzeme Teslimat, Firma Listesi, Çek Takibi, Cari Ödeme/Tahsilat Kaydı.

**Ek — yeni:**
- OdemeKayit'te `İşlem Türü = Üyelik Başlangıç Bedeli` seçildiğinde tarih kolonu full-width oluyor mu?
- Form hata mesajının yanında uyarı üçgeni ikonu görünüyor mu?
- UyeDetailPage Ödemeler tab'ında İşlem Türü kolonunda filter dropdown ve sort ikonu var mı?

Detaylı checklist: `workspace/sessions/20260511-ui-responsive-sprint/output/qa/runtime-audit.md`

### 3. Audit log doğrulaması (TASK-DB-03 + DB-04 closure sonrası)

**Production query'sinde (2026-05-11 gece) son 13 audit kaydı `actor_id=NULL` çıktı** — fakat hepsi 2026-05-10 21:55 saat damgalı, yani TASK-DB-03 öncesi. Bugün yapılan değişiklikler **henüz gerçek bir authenticated kullanıcı işlemi ile test edilmedi**.

Test prosedürü:
1. Vercel preview'da login ol
2. Yeni bir aidat tahakkuku / fatura / firma FIFO eşleştirme yap
3. Sonra Supabase SQL Editor:

```sql
SELECT actor_id, actor_email, table_name, operation, changed_at
FROM public.audit_logs
WHERE changed_at > NOW() - INTERVAL '10 minutes'
ORDER BY changed_at DESC
LIMIT 10;
```

`actor_id` ve `actor_email` dolu gelmeli. Hâlâ NULL geliyorsa: ya controller `req.user?.id` aktarmıyor, ya da yeni RPC çağrılmamış olabilir — bana ilet, debug edeyim.

### 4. ✅ TASK-DB-04 — TAMAMLANDI (commit `25240a9`)

Production audit RPC + 12 BASE TABLE `SET NOT NULL` migration deploy edildi + Zod schema sertleştirme. Detay: BACKLOG `🟡 Açık Sprint Task'ları` bölümünde.

### 5. (Daha önce yapılmadıysa) Admin rollback

`README-admin-rollback.md` artık silindi (önceki commit'te). Eğer `seed_all_users_admin` migration'ı sonucu hala tüm user'lar admin'se manuel:

```sql
-- Mevcut admin sayısı
SELECT COUNT(*) FROM public.user_roles WHERE role='admin';

-- Sadece istediğin user'lar admin kalsın
UPDATE public.user_roles SET role='staff'
WHERE role='admin' AND user_id NOT IN (
  SELECT id FROM auth.users WHERE email IN ('ozdemirfa@gmail.com')
);
```

---

## ✅ Sprint Backlog-Batch1 — Bu Sprintte Kapatılan (2026-05-11)

**Session:** `workspace/sessions/20260511-backlog-sprint-batch1/`
**Commit'ler:**
- `1f8f5bc` — Batch 1 (TASK-BE-04 + fn_match_firm_payments_fifo)
- `b077eee` — Batch 2 (TASK-BE-05/06/07 + TASK-FE-03..06 + CI guard)

### Batch 1
- [x] **TASK-BE-04 (P1):** `cariPaymentSchema.superRefine` defense-in-depth — `cek_id`/`vade_tarihi`/`banka`/`sube` `uyelik_baslangic` için yasaklandı; `iade_odeme` için `odeme_turu='cari'` reddi; çek için `vade_tarihi` zorunlu; tutar upperbound 1B TL. 10 yeni Zod testi eklendi.
- [x] **TASK-DB-03 closure:** `fn_match_firm_payments_fifo` → `p_actor_id` parametresi + `set_config('app.actor_id', ...)` pattern. Migration `20260511000004_audit_actor_firm_fifo.sql`. `fn_match_project_payments_fifo` call-site güncellendi.

### Batch 2
- [x] **TASK-BE-05 (P2):** `VITE_SUPABASE_SERVICE_ROLE_KEY` fallback kaldırıldı + CI grep guard test (`server/tests/unit/serviceRoleKeyExposure.test.ts`).
- [x] **TASK-BE-06 (P2):** `islem_turu_in` whitelist (9 değer) + `slice(0,12)` DoS koruması.
- [x] **TASK-BE-07 (P2):** `createPayment` dispatcher → `_createPaymentAsCek` / `_createPaymentNormal` refactor; `PaymentInput` type extracted.
- [x] **TASK-FE-03 (P2):** OdemeKayit `uyelik_baslangic` durumunda tarih kolonu full-width.
- [x] **TASK-FE-04 (P2):** `onValuesChange` → `useEffect(islemTuru)` refactor; mirror state kaldırıldı.
- [x] **TASK-FE-05 (P2):** UyeDetailPage "İşlem Türü" kolonuna `filters` + `sorter` (tr locale).
- [x] **TASK-FE-06 (P2):** Form hata mesajlarına pseudo-element ikon (WCAG 1.4.1); AntD `aria-invalid` otomatik DOM'a set ediyor.
- [x] **UI Responsive FIX-004:** Önceki commit `36d893d` ile zaten kapanmış (Dashboard FIFO Kapama tek metin).

**Doğrulama:**
- server build clean
- vitest 44/44 passed (33 baseline + 10 schema + 1 guard)
- client tsc clean
- client build clean (2.18 MB / 618 KB gzip)

---

## ✅ Sprint Backlog-Batch3 — Bu Sprintte Kapatılan (2026-05-11 akşam)

**Session:** `workspace/sessions/20260511-backlog-sprint-batch3/`
**Commit'ler:**
- `c67269f` — backend P3 (Morgan PII redact, cariHareketSchema strict, audit policy comments, AuthRequest types)
- `2303411` — TASK-PM-01 undo flow tooltip + Space direction typo bulk fix + spec addendum
- `1bc29a4` — AntD v6 message selector fix (5 E2E instance)

### Kapatılanlar

- [x] **TASK-PM-01 (P2):** UyeDetailPage undo flow tooltip (iade_odeme + uyelik_baslangic için info ikonu + Tooltip) + spec addendum (undo flow karar matrisi).
- [x] **SEC-011 (P3):** Morgan log query string PII redact — `REDACT_WHITELIST` dışındaki tüm query parametreler `[redacted:N]`.
- [x] **SEC-014 (P3):** `cariHareketSchema` `.strict()` + `proje_id` zorunlu — mass assignment koruması.
- [x] **SEC-010 (P3):** `audit_logs` RLS policy'lerine açıklayıcı COMMENT (yeni migration `20260511000005_audit_policy_comments.sql`).
- [x] **CODE-002 (P3):** `cariHesap.controller` AuthRequest `<any,any,any,any>` → Zod-derive types.
- [x] **UX-006 (P3):** `Space orientation="..."` → `direction="..."` typo bulk fix (14 dosya, 26 instance).
- [x] **A6-02 (P3):** `StrictConfirmDelete.tsx` `width="min(450px, 95vw)"` — zaten önceki sprint'te kapanmıştı, doğrulandı.
- [x] **5 E2E selector fix:** AntD v6 `.ant-message-success` → `.ant-message-notice-content .ant-message-success`.
- [x] **TASK-DB-04 statik audit:** Production schema risk değerlendirmesi yapıldı — migration **yazılmadı**, kullanıcı kararına bırakıldı (detay: `workspace/sessions/20260511-backlog-sprint-batch3/output/db04-audit.md`).

### Doğrulama
- server tsc clean
- vitest **44/44 PASS** (baseline korundu)
- client tsc + vite build clean (2.19 MB)
- E2E selector fix'leri statik düzeltme; tam Playwright run kullanıcı tarafından doğrulanmalı

---

## ✅ Sprint Backlog-Closure — Bu Sprintte Kapatılan (2026-05-11 gece)

**Session:** `workspace/sessions/20260511-backlog-closure-sprint/`
**Commit'ler:**
- `81d1178` — Batch 1: cosmetic + cleanup (U-9, U-11, U-12, CODE-007, SEC-015)
- `6878fde` — Batch 2: frontend UX (A2-03, A4-01, A5-01, A8-01, U-8)
- `35eca5d` — Batch 3: SEC-012 CSP/HSTS + CODE-005 createPayment integration test

### Kapatılanlar (14 task)

- [x] **U-9 (P3):** Tag label `Başlangıç Bedeli` → `Başl. Bedeli` (UyeDetailPage)
- [x] **U-10 (P3):** OdemeKayit çek `banka_adi` → `banka` rename — zaten yapılmış, doğrulandı
- [x] **U-11 (P3):** OdemeKayit Select optionRender sadeleştirme — `data.render` indirection kaldırıldı
- [x] **U-12 (P3):** `getErrorMessage` Zod array `details` desteği + yeni `toFormFields` helper
- [x] **CODE-007 (P3):** `seed_admin_user_role.sql` + `seed_all_users_admin.sql` deprecation header
- [x] **SEC-015 (P3):** Çek `vade_tarihi` defensive guard comment netleştirme (kaldırılmıyor — sigorta)
- [x] **CQ-01 (P3):** Dead code `useBreakpoint`/`isMobile` — pages tarafında zaten yapılmış (önceki sprintler), doğrulandı; AdminLayout'ta aktif kullanım (A1-02 skip listesinde)
- [x] **A2-03 (P3):** `DataTable.stickyFirstColumn` opt-in prop — UyeList + FirmaList aktif
- [x] **A4-01 (P2):** Empty state action-oriented copy + CTA — ProjeList "İlk Projeyi Oluştur", ProjeDetail "Projeler Listesine Dön", UyeList "Yeni Üye butonu ile başlayın"
- [x] **A5-01 (P3):** LoadingState tutarlılığı — `aria-busy` / `role="status"` / `aria-live="polite"` + inline prop (Spin standardize)
- [x] **A8-01 (P3):** Tooltip mobile `trigger="click"` — `useIsTouchDevice` hook + UyeDetailPage undo-flow Tooltip
- [x] **U-8 (P3):** UyeDetailPage error state — `isError`/`error`/`refetch` ile guard pattern (Result + Tekrar dene button)
- [x] **SEC-012 (P3):** Helmet frontend CSP/HSTS — `client/vercel.json` headers (HSTS preload, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- [x] **CODE-005 (P3):** `createPayment` happy path integration test — `server/tests/integration/createPayment.happyPath.test.ts` (6 yeni test: staff/admin 201, anon 401, null-role 403, tutar negatif 400, uyelik_baslangic+banka_hesap_id superRefine 400)

### Doğrulama
- server tsc clean
- vitest **50/50 PASS** (44 baseline + 6 yeni createPayment integration)
- client tsc clean
- client vite build clean (2.19 MB / 618 KB gzip)

### Bilinçli Skip (sonraki sprintte)
- **SEC-013** JWT lokal verify — büyük auth refactor riski
- **CODE-006** ESLint `no-explicit-any` — codebase-wide tarama, ayrı sprint
- **A1-02 + CQ-02** AdminLayout MainHeader refactor — UI regression riski
- **A2-02** Aidatlar filtre Drawer — UX karar gerektirir
- **A3-01** `aria-invalid` runtime doğrulaması — Playwright run'a bağlı
- **A3-02** `validateTrigger` global standardize — form behavior değişikliği

---

## 🟡 Açık Sprint Task'ları (sonraki)

### TASK-DB-04 — TAMAMLANDI ✅ (2026-05-11 commit `25240a9`)

**Audit RPC** (`fn_audit_proje_id_nulls`, migration `20260511000006`): Production'da nullable `proje_id` olan 12 BASE TABLE + 2 VIEW tarandı, **hepsinde `null_cnt = 0`**.

**Apply migration** (`20260511000007`, deploy edildi): 12 BASE TABLE'da `ALTER COLUMN proje_id SET NOT NULL`. View'lar (`aidat_detaylari`, `kasa_durumu`) skip edildi.

**Schema sertleştirme** (Zod): 8 INSERT body schema'sında `proje_id` `.optional()`/`.optional().nullable()` → required UUID. (Query filter schema'ları optional kaldı.)

**Doğrulama gereken:** Audit log `actor_id` üretim doğrulaması — son 13 prod audit kaydı `actor_id=NULL`, fakat hepsi TASK-DB-03 öncesi (2026-05-10 21:55). Bugün yapılan değişikliklerden sonra **kullanıcı bir mutate işlem yapıp** `SELECT actor_id, actor_email FROM audit_logs ORDER BY changed_at DESC LIMIT 5` ile dolu mu doğrulamalı.

### Backend P3 — TAMAMLANDI ✅ (sprint 20260511-open-backlog-sprint)

- [x] **SEC-013 (P3):** JWT lokal verify (jose@5) — `verifyJwtLocal` helper + auth.ts refactor (commit `6ced9b9`). SUPABASE_JWT_SECRET env set ise lokal HS256 verify; aksi takdirde fallback `supabase.auth.getUser`. Tahmini ~100ms tasarruf per request. 5 unit test PASS. **Manuel adım:** Render'da `SUPABASE_JWT_SECRET` env eklenmeli.
- [x] **CODE-006 (P3):** ESLint `no-explicit-any` warn (eslint.config.js) + migration timestamp uniqueness CI test (`migrationTimestampUnique.test.ts`, 2 PASS) (commit `8c92b30`). 156 no-explicit-any warning raporlandı (refactor ayrı task).

### Frontend P3 — TAMAMLANDI ✅ (sprint 20260511-open-backlog-sprint)

- [x] **A1-02 + CQ-02 (P3):** AdminLayout MainHeader CSS migration — isMobile prop kaldırıldı, padding/gap/hamburger CSS class'lara taşındı (commit `699a132`).
- [x] **A2-02 (P2):** Aidatlar filtre Drawer — useBreakpoint + mobile "Filtrele" button + Badge + vertical Drawer (commit `a4a3922`).
- [x] **A3-01 (P3):** `aria-invalid` runtime Playwright spec — `client/e2e/aria-invalid.spec.ts` (3 senaryo) (commit `a4a3922`). **Manuel adım:** lokal docker + supabase start gerekli.
- [x] **A3-02 (P2):** `validateTrigger` global standardize — 18 dosyada 20 Form'a `["onBlur","onChange"]` (commit `699a132`).

### TASK-DB-03 — TAMAMLANDI ✅

13 mutate RPC + member FIFO + project FIFO + **firm FIFO** actor_id pattern'i uygulandı.

---

## 🟢 Yeni Fikir / Sonraki Sprint Adayları

### Audit log koruması
- Audit_logs için partition + retention politikası (yıllık partition, 7+ yıl saklama)
- Admin UI: audit history viewer (mevcut `fn_audit_history` RPC zaten var, sadece frontend eksik)

### UI/UX iyileştirmeleri
- Dark mode hazırlığı (CSS variable'lar zaten var, theme switcher eklenebilir)
- Loading skeleton'ların tüm sayfalara genişletilmesi
- DataTable'lara virtual scrolling (büyük listeler için)

### Performance
- Client bundle 2.18 MB → code splitting (vite chunk strategy)
- Server side Redis cache (roleCache + project membership)

### Test infrastructure (uzun vade)
- Playwright test infra'sının tamamı SSR-safe pattern'lerle yenilenmesi
- pgTAP unit testleri DB RPC'leri için

---

## 📁 Aktif Workspace Sessions

- `workspace/sessions/20260510-qa-review-sprint/` (kapalı, ama backlog'u var — kalan: PM-01, 5 e2e, 17 P3, DB-04)
- `workspace/sessions/20260511-ui-responsive-sprint/` (kapalı — CLOSED.md mevcut)
- `workspace/sessions/20260511-cari-payment-500-fix/` (kapalı — commit `2bd297b`)
- `workspace/sessions/20260511-audit-actor-rpc-continued/` (kapalı — TASK-DB-03 13 RPC)
- `workspace/sessions/20260511-backlog-sprint-batch1/` (kapandı — commit'ler 1f8f5bc + b077eee)
- `workspace/sessions/20260511-backlog-sprint-batch3/` (kapandı — commit'ler c67269f + 2303411 + 1bc29a4)
- `workspace/sessions/20260511-backlog-closure-sprint/` (BU SPRINT, kapandı — commit'ler 81d1178 + 6878fde + 35eca5d, 14 P3 task)

---

## ⚙️ Açık Konfig Notları

- **CORS_ORIGINS** Render env: `https://koop-gen-hes.vercel.app` ✓ set edildi
- **Supabase migration:** `supabase db push` ile sync mümkün (CLI v2.98.2 linked: `melbamccnvzhowgeybbj`)
- **Auto-mode classifier:** master'a `git push` engellemiyor artık (son 6 push başarılı — sprint-batch1'in iki batch'i dahil)

---

## 🔗 Önemli Linkler

- Repo: https://github.com/ozdemirfa/koop-gen-hes
- Vercel: https://koop-gen-hes.vercel.app
- Render: https://koop-gen-hes.onrender.com
- Supabase project ref: `melbamccnvzhowgeybbj`

---

## Son commitler (referans için)

```
35eca5d feat(sprint-closure): batch 3 — SEC-012 CSP/HSTS + CODE-005 createPayment integration test
6878fde feat(sprint-closure): batch 2 — frontend UX (A2-03/A4-01/A5-01/A8-01/U-8)
81d1178 feat(sprint-closure): batch 1 — cosmetic + cleanup (U-9/U-11/U-12/CODE-007/SEC-015)
c9af436 docs(backlog): TASK-DB-04 kapanis + manuel adimlar guncellemesi
25240a9 feat(TASK-DB-04): proje_id NOT NULL apply + schema sertlestirme
1bc29a4 test(sprint-batch3): AntD v6 message selector fix
2303411 fix(sprint-batch3): TASK-PM-01 undo flow tooltip + Space direction typo + spec addendum
c67269f feat(sprint-batch3): backend P3 — Morgan PII redact + cariHareketSchema strict + audit policy comments
```

Yarın açış: **bu dosyanın 🔴 bölümündeki manuel doğrulama adımları** halen geçerli:
1. Vercel preview UI testi — yeni eklenen empty state CTA'ları (ProjeList "İlk Projeyi Oluştur"), sticky kolon (UyeList/FirmaList mobile horizontal scroll), tooltip mobile click (UyeDetailPage undo flow info icon)
2. **CSP doğrulaması:** Vercel deploy sonrası `https://koop-gen-hes.vercel.app` üzerinde DevTools Console'da CSP violation var mı kontrol; özellikle `connect-src` Supabase + Render URL'leri için.
3. Audit log `actor_id` doğrulaması — son 5 mutate sonrası `SELECT actor_id, actor_email FROM audit_logs ORDER BY changed_at DESC LIMIT 5` (TASK-DB-03 + DB-04 closure)
4. Playwright run: `cd client && npx playwright test` ile genel regression.

Sonraki sprint (Batch 5) kalanları — TAMAMLANDI ✅ (sprint 20260511-open-backlog-sprint):
- [x] **Backend:** SEC-013 (JWT jose@5 lokal verify), CODE-006 (ESLint no-explicit-any warn + migration timestamp CI test)
- [x] **Frontend P3:** A1-02/CQ-02 (AdminLayout CSS migration), A2-02 (Aidatlar Drawer), A3-01 (aria-invalid Playwright), A3-02 (validateTrigger global)

Commit'ler: `a4a3922` (Batch 1) + `699a132` (Batch 2) + `8c92b30` (CODE-006) + `6ced9b9` (SEC-013)
Test baseline: 50 → **57 PASS** (+2 migration timestamp, +5 verifyJwtLocal)
