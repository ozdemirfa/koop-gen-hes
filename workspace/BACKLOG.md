# Backlog — koopGenHes

**Son güncelleme:** 2026-05-11 (akşam — backlog-sprint-batch1 sonrası)
**Bir sonraki çalışma:** 2026-05-12 (yarın)

Bu dosya günden güne kalan işleri biriktirir. Yarın açıp buradan devam.

---

## 🔴 Hemen yapılacak — Doğrulama / Manuel Adımlar

### 1. supabase db push (TASK-DB-03 closure)

Migration `20260511000004_audit_actor_firm_fifo.sql` remote'a uygulanmalı:

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

### 4. (Daha önce yapılmadıysa) Admin rollback

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

## 🟡 Açık Sprint Task'ları (Batch 3 / yarın)

### Önceki QA Sprint Backlog (`20260510-qa-review-sprint`) — kalan

- [ ] **TASK-PM-01 (P2):** `iade_odeme` / `uyelik_baslangic` undo flow tooltip + spec
- [ ] **17 P3 task** — kozmetik/kalite (Morgan PII, JWT lokal verify, AuthRequest types, Helmet/CSP, vb.)
- [ ] **TASK-DB-04 sonrası:** `proje_id NOT NULL` audit sonucunu uygulamaya geçir (mevcut migration `20260510000018` sadece dry-run NOTICE üretiyor)
- [ ] **5 E2E test bug:** AntD 6 selector pattern güncellemeleri (qa-report-v3.md §kalan FAIL)

### UI Responsive Sprint — Kalan P3 + Backlog

Detay: `workspace/sessions/20260511-ui-responsive-sprint/sprint-plan.md`

- [ ] **7 P3 bulgu** — code-audit.md'de listeli
- [ ] **BL-* task'lar** — sprint dışına itelenenler

### TASK-DB-03 — TAMAMLANDI ✅

13 mutate RPC + member FIFO + project FIFO + **firm FIFO** (bu sprint) actor_id pattern'i uygulandı.

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
- `workspace/sessions/20260511-backlog-sprint-batch1/` (BU SPRINT, kapandı — commit'ler 1f8f5bc + b077eee)

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
b077eee feat(sprint-batch2): TASK-BE-05/06/07 + TASK-FE-03/04/05/06 + CI guard
1f8f5bc feat(sprint-batch1): TASK-BE-04 schema sertlestirme + fn_match_firm_payments_fifo p_actor_id
04c074c fix(migration): TASK-DB-03 COMMENT ON FUNCTION imzasi ekle
5c8275e feat(audit): TASK-DB-03 devami — 13 RPC'ye p_actor_id pattern uygula
2bd297b fix(payment-500): odeme_yontemi enum cast eksigi (42804) + errorHandler PG kod genislemesi
36d893d fix(ui): responsive button labels + modal widths + dead code cleanup
e5e3965 feat(audit): TASK-DB-03 actor_id integration — trigger + 3 RPC
```

Yarın açış: **bu dosyanın 🔴 bölümündeki manuel adımları** (özellikle `supabase db push`) yap; sonra 🟡 Batch 3 task'larına geç:
1. **TASK-PM-01** — undo flow tooltip + spec güncellemesi
2. **5 E2E AntD 6 selector fix** — Playwright çalıştırılması
3. **TASK-DB-04** — proje_id NOT NULL apply (risk değerlendirmesi ile)
4. **17 P3 kozmetik task** — backlog hijyen sprinti olarak gruplandırılabilir
