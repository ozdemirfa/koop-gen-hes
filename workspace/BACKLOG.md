# Backlog — koopGenHes

**Son güncelleme:** 2026-05-11 (gece — backlog-sprint-batch3 sonrası)
**Bir sonraki çalışma:** 2026-05-12 (yarın)

Bu dosya günden güne kalan işleri biriktirir. Yarın açıp buradan devam.

---

## 🔴 Hemen yapılacak — Doğrulama / Manuel Adımlar

### 1. supabase db push (TASK-DB-03 closure + sprint-batch3 closure)

İki migration deploy edilmeli:
- `20260511000004_audit_actor_firm_fifo.sql` (önceki sprint, BACKLOG'dan beklemede)
- `20260511000005_audit_policy_comments.sql` (sprint-batch3, audit log policy COMMENT'leri)

```bash
supabase db push
```

Sonra Supabase SQL editor'da imza doğrula:

```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname = 'fn_match_firm_payments_fifo';
-- Beklenen: (p_proje_id uuid, p_firma_id uuid, p_actor_id uuid DEFAULT NULL)
```

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

### 3. Audit log doğrulaması (TASK-DB-03 sonrası)

Yeni üye/ödeme işlemi yap, sonra Supabase SQL Editor'a:

```sql
SELECT actor_id, actor_email, table_name, operation, changed_at
FROM public.audit_logs
WHERE changed_at > NOW() - INTERVAL '1 hour'
ORDER BY changed_at DESC
LIMIT 10;
```

`actor_id` ve `actor_email` artık dolu gelmeli (önceden NULL'du). Firma FIFO eşleştirmesi sonrası da `actor_id` dolu olmalı (yeni: migration `20260511000004`).

### 4. TASK-DB-04 NULL audit — `supabase db push` ile dry-run NOTICE çıktısını topla

Migration `20260510000018_audit_proje_id_nullable.sql` zaten repo'da; `db push` sırasında bir kez çalışır ve **Messages** sekmesinde her tablonun NULL count'unu raporlar:

```
NOTICE:  Table cekler: NULL count = 0
NOTICE:  Table faturalar: NULL count = 3
NOTICE:  Table cari_hareketler: NULL count = 0
...
```

Sonucu paylaş — master backfill stratejisi + `SET NOT NULL` migration hazırlasın.
Detay: `workspace/sessions/20260511-backlog-sprint-batch3/output/db04-audit.md`

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

## 🟡 Açık Sprint Task'ları (Batch 4 / sonraki)

### TASK-DB-04 — DEVAM EDEN (kullanıcı eylemi bekliyor)

**Durum:** Statik audit raporu hazır (`db04-audit.md`). Kullanıcı eylemi gerekli:

1. `supabase db push` ile mevcut migration `20260510000018_audit_proje_id_nullable.sql` çalıştır → NOTICE'larda her tablo için NULL count.
2. NOTICE çıktısını paylaş → master backfill stratejisi + `SET NOT NULL` migration draft yazsın.

**Risk:** 14 tabloda `proje_id` NULLABLE. Schema'ların büyük kısmı `proje_id`'yi optional kabul ediyor → prod'da NULL satır olma olasılığı yüksek. Körlemesine `SET NOT NULL` migration'ı patlatır.

### Backend P3 (kalan — bu sprintte atlanan)

- [ ] **SEC-013 (P3):** JWT lokal verify (jose lib) — Supabase round-trip azaltma
- [ ] **SEC-015 (P3):** Çek `vade_tarihi` server-default kaldır — schema seviyesinde zorunlu kıl. TASK-BE-04'te superRefine ile yapıldı, service'de defensive default hala var
- [ ] **CODE-001 (P2):** `cariHesap.service.ts.createPayment` çek branch'ini özel metoda ayır — **TASK-BE-07'de yapıldı** (kapat)
- [ ] **CODE-005 (P3):** Yeni feature integration test (`createPayment` happy path) + Playwright E2E `uyelik-devir-flow.spec.ts` zaten var, kapatılabilir
- [ ] **CODE-006 (P3):** ESLint `no-explicit-any` warn + migration timestamp uniqueness CI test — büyük, ayrı sprint
- [ ] **CODE-007 (P3):** `seed_admin_user_role.sql` ve `seed_all_users_admin.sql` deprecation/clean-up
- [ ] **SEC-012 (P3):** Helmet CSP/HSTS — frontend tarafında

### Frontend P3 (kalan — bu sprintte atlanan)

- [ ] **A1-02 + CQ-02 (P3):** AdminLayout MainHeader kalan JS-isMobile branch'ları → CSS class
- [ ] **CQ-01 (P3):** Dead code temizliği — `useBreakpoint`/`isMobile` artık kullanılmayan 9 sayfada deklarasyonları sil
- [ ] **A2-02 (P2):** Aidatlar filtre satırı mobile Drawer/Collapse
- [ ] **A2-03 (P3):** DataTable `fixed: 'left'` sticky column
- [ ] **A3-01 (P3):** `aria-invalid` runtime doğrulaması (manuel/Playwright)
- [ ] **A3-02 (P2):** `validateTrigger` global standardize
- [ ] **A4-01 (P2):** Empty state action-oriented copy
- [ ] **A5-01 (P3):** LoadingState tutarlılığı
- [ ] **A8-01 (P3):** Tooltip mobile `trigger="click"`
- [ ] **U-2 (P2):** OdemeKayit `onValuesChange` → `useEffect(islemTuru)` (**TASK-FE-04'te yapıldı** ✓)
- [ ] **U-3 (P2):** UyeDetailPage Ödemeler kolonu filter/sort (**TASK-FE-05'te yapıldı** ✓)
- [ ] **U-4 (P2):** undo flow netleştir (**TASK-PM-01'de yapıldı** ✓, kapat)
- [ ] **U-5 (P2):** Form hata mesajları ikon (**TASK-FE-06'da yapıldı** ✓)
- [ ] **U-7 (P3):** Statistic value `clamp()` responsive font — zaten UI sprint'inde yapıldı
- [ ] **U-8 (P3):** UyeDetailPage error state (Result + retry button)
- [ ] **U-9 (P3):** Tag label "Başlangıç Bedeli" → "Başl. Bedeli" + ellipsis
- [ ] **U-10 (P3):** OdemeKayit çek "banka_adi" → "banka" rename
- [ ] **U-11 (P3):** OdemeKayit `optionRender` sadeleştir
- [ ] **U-12 (P3):** `getErrorMessage` Zod array parse desteği

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
- `workspace/sessions/20260511-backlog-sprint-batch3/` (BU SPRINT, kapandı — commit'ler c67269f + 2303411 + 1bc29a4)

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
1bc29a4 test(sprint-batch3): AntD v6 message selector fix — 5 E2E instance kararsizdi
2303411 fix(sprint-batch3): TASK-PM-01 undo flow tooltip + Space direction typo + spec addendum
c67269f feat(sprint-batch3): backend P3 — Morgan PII redact + cariHareketSchema strict + audit policy comments + AuthRequest types
24cd7ac docs(backlog): sprint-batch1 kapanis — 12 task kapatildi (P1+P2)
b077eee feat(sprint-batch2): TASK-BE-05/06/07 + TASK-FE-03/04/05/06 + CI guard
1f8f5bc feat(sprint-batch1): TASK-BE-04 schema sertlestirme + fn_match_firm_payments_fifo p_actor_id
```

Yarın açış: **bu dosyanın 🔴 bölümündeki manuel adımları** yap:
1. `supabase db push` → migration `20260511000005_audit_policy_comments.sql` deploy
2. `supabase db push` ile `20260510000018_audit_proje_id_nullable.sql` çalıştır → NOTICE çıktısı paylaş (TASK-DB-04 için NULL count)
3. Vercel preview UI testi (Space direction fix sonrası — özellikle Aidatlar, FirmaList, UyeList sayfalarında Space alignments)
4. Playwright run: `cd client && npx playwright test fifo-safety.spec.ts serefiye-refresh.spec.ts` ile 5 düzeltilmiş E2E'yi doğrula

Sonra Batch 4 task'larına geç:
1. **TASK-DB-04 apply** — NULL audit sonucu paylaşıldıktan sonra backfill + NOT NULL migration
2. **Backend P3 kalan** — SEC-013 JWT lokal verify, CODE-006/007 hijyeni
3. **Frontend P3 kalan** — A2-02 (Aidatlar Drawer), A3-02 (validateTrigger), A4-01 (empty state)
