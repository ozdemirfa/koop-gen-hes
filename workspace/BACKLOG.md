# Backlog — koopGenHes

**Son güncelleme:** 2026-05-11 (bugün)
**Bir sonraki çalışma:** 2026-05-12 (yarın)

Bu dosya günden güne kalan işleri biriktirir. Yarın açıp buradan devam.

---

## 🔴 Hemen yapılacak — Doğrulama / Manuel Adımlar

### 1. Vercel preview UI testi (UI responsive sprint sonrası)

Commit `36d903d` ile gelen fix'leri 3 viewport'ta doğrula:

- **1920×1080 (desktop):** Header'da "Yeni X" butonlarının text'i tüm sayfalarda görünüyor mu?
- **768×1024 (tablet):** Aynı kontrol.
- **375×667 (mobile):** Modal'lar tam ekran sığıyor mu, `width="min(520px, 95vw)"` çalışıyor mu?

Kapsayacak sayfalar: Aidat Tanımları, Üye Yönetimi, Hakedişler, Faturalar, Banka Hesapları, Malzeme Teslimat, Firma Listesi, Çek Takibi, Cari Ödeme/Tahsilat Kaydı.

Detaylı checklist: `workspace/sessions/20260511-ui-responsive-sprint/output/qa/runtime-audit.md`

### 2. Audit log doğrulaması (TASK-DB-03 sonrası)

Yeni üye/ödeme işlemi yap, sonra Supabase SQL Editor'a:

```sql
SELECT actor_id, actor_email, table_name, operation, changed_at
FROM public.audit_logs
WHERE changed_at > NOW() - INTERVAL '1 hour'
ORDER BY changed_at DESC
LIMIT 10;
```

`actor_id` ve `actor_email` artık dolu gelmeli (önceden NULL'du).

### 3. (Daha önce yapılmadıysa) Admin rollback

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

## 🟡 Açık Sprint Task'ları

### TASK-DB-03 Devam — kalan atomic RPC'ler ✅ KAPANDI (2026-05-11)

Sprint: `workspace/sessions/20260511-audit-actor-rpc-continued/`
Migration: `supabase/migrations/20260511000003_audit_actor_remaining_rpcs.sql`

Kapatılan 13 RPC:
- [x] `fn_create_fatura_atomic`
- [x] `fn_update_fatura_atomic`
- [x] `fn_charge_aidat_tanimi`
- [x] `create_yillik_aidat_plani`
- [x] `fn_execute_aidat_charging`
- [x] `fn_bulk_charge_interest`
- [x] `fn_toggle_aidat_faiz`
- [x] `fn_calculate_single_aidat_late_fee`
- [x] `fn_create_irsaliye_atomic`
- [x] `fn_match_member_payments_fifo`
- [x] `fn_match_project_payments_fifo`
- [x] `fn_undo_payment_match`
- [x] `fn_undo_hakedis_closure`

**Bonus:** `aidatService.recordPayment` + `recordBulkPayment` iç çağrılarına da actor iletimi eklendi.

**Doğrulama (sandbox):** ✅ Build clean, ✅ 33/33 test passed.
**Manuel adımlar:**
- [ ] `supabase db push` (kullanıcı)
- [ ] RPC imza SQL kontrolü
- [ ] Yeni fatura/irsaliye sonrası `audit_logs.actor_id` dolu mu doğrula

### TASK-DB-03 Sonraki Adım — `fn_match_firm_payments_fifo`

`fn_match_project_payments_fifo` firma tarafı için `fn_match_firm_payments_fifo`'yu çağırıyor; o RPC henüz `p_actor_id` parametresi almıyor. Bir sonraki audit sprint'inde aynı pattern uygulanmalı. Parent RPC'nin session var'ı miras alınıyor — yine de tutarlılık için tamamlanmalı.

---

### UI Responsive Sprint — Kalan P3 + Backlog

Detay: `workspace/sessions/20260511-ui-responsive-sprint/sprint-plan.md`

- [ ] **FIX-004 (P2):** Audit'te tespit edilen kalan responsive bulgu (sprint-plan §3'te)
- [ ] **7 P3 bulgu** — code-audit.md'de listeli
- [ ] **BL-* task'lar** — sprint dışına itelenenler

---

### Önceki QA Sprint Backlog (`20260510-qa-review-sprint`)

Bu sprint'te P0/P1'ler kapandı. Kalan:

- [ ] **TASK-FE-03 (P2):** OdemeKayit `uyelik_baslangic` durumunda tarih kolonu full-width
- [ ] **TASK-FE-04 (P2):** OdemeKayit `onValuesChange` yan etkilerini `useEffect`'e taşı
- [ ] **TASK-FE-05 (P2):** UyeDetailPage Ödemeler "İşlem Türü" kolonuna filter+sorter
- [ ] **TASK-FE-06 (P2):** Form hata mesajlarına icon + `aria-invalid` doğrulama
- [ ] **TASK-PM-01 (P2):** `iade_odeme` / `uyelik_baslangic` undo flow tooltip + spec
- [ ] **TASK-BE-04 (P1):** `cariPaymentSchema.superRefine` eksik koruma vektörleri
- [ ] **TASK-BE-05 (P2):** `VITE_SUPABASE_SERVICE_ROLE_KEY` fallback temizliği + CI grep guard
- [ ] **TASK-BE-06 (P2):** `islem_turu_in` whitelist + slice(0,N) DoS koruması
- [ ] **TASK-BE-07 (P2):** `createPayment` çek branch'ini özel metoda ayır
- [ ] **17 P3 task** — kozmetik/kalite (Morgan PII, JWT lokal verify, AuthRequest types, Helmet/CSP, vb.)
- [ ] **TASK-DB-04 sonrası:** `proje_id NOT NULL` audit sonucunu uygulamaya geçir (mevcut migration `20260510000018` sadece dry-run NOTICE üretiyor)
- [ ] **5 E2E test bug:** AntD 6 selector pattern güncellemeleri (qa-report-v3.md §kalan FAIL)

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

- `workspace/sessions/20260510-qa-review-sprint/` (kapalı, ama backlog'u var)
- `workspace/sessions/20260511-ui-responsive-sprint/` (kapalı — CLOSED.md mevcut)
- `workspace/sessions/20260511-cari-payment-500-fix/` (durum bilinmiyor — yarın bak)

---

## ⚙️ Açık Konfig Notları

- **CORS_ORIGINS** Render env: `https://koop-gen-hes.vercel.app` ✓ set edildi
- **Supabase migration:** `supabase db push` ile sync mümkün (CLI v2.98.2 linked: `melbamccnvzhowgeybbj`)
- **Auto-mode classifier:** master'a `git push` engellemiyor artık (son birkaç push başarılı)

---

## 🔗 Önemli Linkler

- Repo: https://github.com/ozdemirfa/koop-gen-hes
- Vercel: https://koop-gen-hes.vercel.app
- Render: https://koop-gen-hes.onrender.com
- Supabase project ref: `melbamccnvzhowgeybbj`

---

## Son commitler (referans için)

```
36d903d fix(ui): responsive button labels + modal widths + dead code cleanup
e5e3965 feat(audit): TASK-DB-03 actor_id integration — trigger + 3 RPC
9d46805 fix(layout): header action butonlarinin etiketleri clip oluyor
274f6cb fix(sprint-20260510): P0 + P1 + test infra v3 — 7 task kapatildi
fd826cb feat: iade_odeme + uyelik_baslangic kalem turleri
```

Yarın açış: bu dosyanın 🔴 bölümündeki manuel adımlardan başla; sonra 🟡 sprint task'larına geç.
