# Sprint Changelog — 20260511-backlog-sprint-batch1

**Tarih:** 2026-05-11
**Kapsam:** Batch 1 + Batch 2 (P1 + P2 backlog task'ları)
**Doğrulama:** server build clean, vitest 44/44, client build clean.

---

## Batch 1 — Critical hardening (commit 1f8f5bc)

### TASK-BE-04 (P1) — cariPaymentSchema defense-in-depth
**Dosya:** `server/src/schemas/cariHesap.schema.ts`

- `uyelik_baslangic` islem_turu için ek alan yasakları: `cek_id`, `vade_tarihi`, `banka`, `sube` reddedilir.
- `iade_odeme` için `odeme_turu='cari'` reddedilir (gerçek para çıkışı: banka/nakit/çek/kredi_karti zorunlu).
- Çek ödemesi için `vade_tarihi` schema-level zorunlu (server-side default kaldırıldı; finansal kayıt bütünlüğü).
- `tutar` üst sınırı: `1_000_000_000` TL (audit log blast radius koruması).

**Test eki:** `server/tests/unit/cariPaymentSchema.test.ts` 10 yeni test (toplam 15 schema test).

### TASK-DB-03 closure — fn_match_firm_payments_fifo
**Migration:** `supabase/migrations/20260511000004_audit_actor_firm_fifo.sql`

- `fn_match_firm_payments_fifo(p_proje_id, p_firma_id)` → `(p_proje_id, p_firma_id, p_actor_id UUID DEFAULT NULL)`
- `set_config('app.actor_id', ...)` pattern (canonical pattern: `20260511000003`)
- `fn_match_project_payments_fifo`'nun firma FIFO call-site'i p_actor_id'yi ilerletecek şekilde güncellendi.
- Geriye uyumluluk: DEFAULT NULL — eski (proje_id, firma_id) çağrıları bozulmaz.

---

## Batch 2 — Quality (commit pending)

### TASK-BE-05 (P2) — VITE_SUPABASE_SERVICE_ROLE_KEY fallback temizliği
**Dosya:** `server/src/config/supabase.ts`

- `VITE_` prefix'li URL ve service-role-key fallback'leri kaldırıldı.
- Fail-fast: env eksikse açık hata mesajı, "VITE_ prefix YASAKTIR — client bundle sızıntısı riski".
- CI grep guard: `server/tests/unit/serviceRoleKeyExposure.test.ts` — server/src + client/src ağacında `VITE_SUPABASE_SERVICE_ROLE_KEY` referansı varsa fail.

### TASK-BE-06 (P2) — islem_turu_in whitelist + DoS koruması
**Dosya:** `server/src/services/cariHesap.service.ts`

- `ISLEM_TURU_WHITELIST` const (`Set<string>`): 9 değer (`gelen_odeme`, `giden_odeme`, `iade_odeme`, `uyelik_baslangic`, `aidat_kayit`, `hakedis`, `gecikme_faizi`, `fatura`, `odeme`).
- `MAX_ISLEM_TURU_IN = 12` slice limiti.
- Whitelist dışı / boş değerler filtrelenir; log gürültüsü ve PostgREST DoS yarıçapı sınırlanır.

### TASK-BE-07 (P2) — createPayment çek branch refactor
**Dosya:** `server/src/services/cariHesap.service.ts`

- `createPayment` artık dispatcher (5 satır).
- `_createPaymentAsCek(paymentData)` — çek yolu, firma_id lookup, `cekler` insert, defansif `vade_tarihi` kontrolü.
- `_createPaymentNormal(paymentData)` — RPC `fn_create_payment_atomic` çağrısı.
- `PaymentInput` type extracted; controller imzası stabil kalır (geriye uyumlu).
- Çek-specific alanlar (`cek_id`, `vade_tarihi`, `banka`, `sube`) normal path'te explicitly drop edilir.

### TASK-FE-03 (P2) — OdemeKayit uyelik_baslangic tarih kolonu full-width
**Dosya:** `client/src/pages/cariHesap/OdemeKayit.tsx`

- `Col xs={24} md={islemTuru === 'uyelik_baslangic' ? 24 : 12}` — `uyelik_baslangic` modunda "İşlem Tarihi" tek başına md={24}.

### TASK-FE-04 (P2) — onValuesChange → useEffect refactor
**Dosya:** `client/src/pages/cariHesap/OdemeKayit.tsx`

- `setOdemeTuru` mirror state kaldırıldı; `Form.useWatch('odeme_turu', form)` ile reaktif okuma.
- `useEffect(islemTuru)` ile `islem_turu` değişimine reaktif yan etkiler:
  - `iade_odeme`/`uyelik_baslangic` → `filterCariTuru='uye'`, cari_hesap_id reset.
  - `uyelik_baslangic` → odeme_turu='cari', banka/cek/vade/banka/sube reset (TASK-BE-04 schema ile tam uyum).
  - `iade_odeme` → odeme_turu 'cari' ise 'banka'ya çevir (TASK-BE-04 schema 'cari' yasağı ile uyum).
- `onValuesChange` callback'i tamamen kaldırıldı.
- Bonus: `handleOdemeTuruChange` ölü kodu temizlendi.

### TASK-FE-05 (P2) — UyeDetailPage "İşlem Türü" filter+sorter
**Dosya:** `client/src/pages/uyeler/UyeDetailPage.tsx`

- `filters` prop'u — `islemTuruMeta`'dan türetilen 3 filtre seçeneği (Tahsilat, İade, Başlangıç Bedeli).
- `onFilter` callback'i tam eşleşme.
- `sorter` — Türkçe locale-aware (label'a göre).

### TASK-FE-06 (P2) — Form hata icon + aria-invalid
**Dosya:** `client/src/index.css`

- `.ant-form-item-explain-error::before` pseudo-element — uyarı üçgeni SVG inline data URI.
- `display: flex`, gap, align-items ile ikon + text birlikte.
- WCAG 2.2 SC 1.4.1 (use-of-color) uyumu: kırmızı border + ikon birlikte.
- AntD `validateStatus="error"` zaten `aria-invalid="true"` set ediyor (DOM seviyesinde doğrulanabilir).

### UI Responsive FIX-004 — Dashboard FIFO Kapama CLS
**Durum:** Önceki commit `36d893d` ile zaten kapatıldı.

`Dashboard.tsx:108` artık tek metin "Hesap Kapamalarını Yap"; isMobile ternary kaldırılmış. Tekrar bir aksiyon gerekmiyor.

---

## Doğrulama

```
$ cd server && npm run build
> tsc           (clean)

$ cd server && npx vitest run
Test Files  5 passed (5)
     Tests  44 passed (44)

$ cd client && npx tsc --noEmit
(clean)

$ cd client && npm run build
✓ built in 8.06s
dist/assets/index-DtMTl-8H.js   2,185.78 kB │ gzip: 617.83 kB
```

---

## Manuel adım (kullanıcı)

```bash
supabase db push
```

Migration `20260511000004_audit_actor_firm_fifo.sql` remote'a uygulanmalı. Bunu yapana kadar firma FIFO `p_actor_id` parametresi DB tarafında yok — backend çağrı zaten geriye uyumlu (RPC sadece `(proje_id, firma_id)` ile çağrılıyor; `(proje_id, firma_id, NULL)` da çalışır).

---

## Bu sprint dışında bırakılan (Batch 3, yarın)

- TASK-PM-01 — undo flow tooltip + spec
- 5 E2E AntD 6 selector fix
- 17× P3 BACKLOG task
