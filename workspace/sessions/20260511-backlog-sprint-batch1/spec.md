# Sprint Spec — Backlog Batch 1 + 2 (Quality)

**Session ID:** 20260511-backlog-sprint-batch1
**Tarih:** 2026-05-11
**Audience:** Master-agent (orchestrator) + alt-ajanlar (master kendisi dispatch eder)
**Mod:** Code-modify allowed
**Push policy:** Master commits + push (user yetki verdi)

---

## 0. Sprint Hedefi

BACKLOG.md'deki açık P1 + P2 task'larından **kalite-odaklı** olanları kapatmak. UI/UX layout + state hijack, backend defense-in-depth, schema sertleştirme. E2E test pattern güncellemesi ve TASK-PM-01 (Batch 3) yarına bırakılır.

## 1. Kapsam (sprint içinde kapatılacak — 12 task)

### Batch 1 — Backend P1 (1 task)
- **TASK-BE-04** — `cariPaymentSchema.superRefine` eksik koruma vektörleri (`cek_id`, `vade_tarihi`, `banka`, `sube` reddi; `iade_odeme` için odeme_turu whitelist; tutar üst sınırı).

### Batch 1 — Database P2 (1 task)
- **fn_match_firm_payments_fifo** — `p_actor_id` parametresi + `set_config('app.actor_id', ...)` pattern; pattern: `20260511000003`. Mevcut imza `(p_proje_id UUID, p_firma_id UUID)` → yeni imza `(p_proje_id UUID, p_firma_id UUID, p_actor_id UUID DEFAULT NULL)`. **Çağıran tek yer** `fn_match_project_payments_fifo` (mevcut migration'ın 954. satırı) — onun da call site'ı güncellenmeli (aynı migration'da).

### Batch 2 — Backend P2 (3 task)
- **TASK-BE-05** — `VITE_SUPABASE_SERVICE_ROLE_KEY` fallback temizliği (server/src/config/supabase.ts, auth.ts).
- **TASK-BE-06** — `islem_turu_in` whitelist + slice(0,N) DoS koruması (cariHesap.service.ts).
- **TASK-BE-07** — `createPayment` çek branch'ini özel metoda ayır (`_createPaymentAsCek`).

### Batch 2 — Frontend P2 (4 task)
- **TASK-FE-03** — OdemeKayit `uyelik_baslangic` durumunda tarih kolonu full-width (`md={24}`).
- **TASK-FE-04** — OdemeKayit `onValuesChange` yan etkilerini `useEffect`'e taşı.
- **TASK-FE-05** — UyeDetailPage Ödemeler "İşlem Türü" kolonuna `filters` + `sorter`.
- **TASK-FE-06** — Form hata mesajlarına icon + `aria-invalid` doğrulama (genel `Form.Item` wrapper veya CSS).

### Batch 2 — Diğer
- **UI Responsive FIX-004** — `workspace/sessions/20260511-ui-responsive-sprint/sprint-plan.md` § FIX-004 (kalan responsive bulgu).

## 2. Sprint dışı (bilinçli scope-out)

- **TASK-PM-01** — undo flow tooltip + spec (yarına Batch 3).
- **5 E2E AntD 6 selector fix** — yarına Batch 3 (Playwright çalıştırması ayrı validation döngüsü gerektirir).
- **17× P3** — kozmetik, BACKLOG'da bekler.
- **TASK-DB-04** (`proje_id NOT NULL` apply) — ayrı risk değerlendirmesi.
- **🟢 yeni fikir bölümü** (dark mode, bundle split) — sonraki sprint.

## 3. Pipeline ve sıralama

Master, agent dispatch yerine **doğrudan kodlama yapacak** (memory'de kayıtlı `Single-dispatch fallback pattern` gereği — Task subagent tool yoksa veya tek-ekip içinde tutarlılık için).

Sıra:
1. **Batch 1** — paralel: TASK-BE-04 schema + migration `20260511000004_audit_actor_firm_fifo.sql`.
2. **Batch 1 doğrulama** — server build + vitest run, baseline 33/33 korunmalı.
3. **Batch 1 commit + push.**
4. **Batch 2 backend** — TASK-BE-05/06/07.
5. **Batch 2 frontend** — TASK-FE-03/04/05/06 + FIX-004.
6. **Batch 2 doğrulama** — server build, client build, vitest run.
7. **Batch 2 commit + push.**
8. **Final report + BACKLOG.md update.**

## 4. Doğrulama (her batch sonu zorunlu)

- `cd server && npm run build` — clean
- `cd server && npx vitest run` — 33/33 baseline korunmalı; yeni TDD testleri eklendiyse 33+N olmalı
- Frontend için: `cd client && npm run build`
- Manuel: schema değişikliği için Zod test'leri (TASK-BE-04'e en az 3 yeni test eklenecek)

## 5. Production-safe kurallar (master'ın uygulayacağı)

- DB değişikliği sadece migration dosyası yaz. **`supabase db push` user çalıştıracak.**
- `--no-verify`, `--force` yok. Hook fail olursa root cause düzelt.
- Destructive operasyon yok.
- Production env/Render/Vercel değişikliği yok.

## 6. Çıktılar

- `workspace/sessions/20260511-backlog-sprint-batch1/output/`
  - `database/` — migration sql + READAY.md
  - `backend/` — schema + service değişiklik notları + test ek
  - `frontend/` — tsx değişiklik notları
  - `qa/` — vitest output + build log özet
  - `reviews/` — changelog
- Commit'ler (2 batch ayrı)
- BACKLOG.md güncellemesi
