# Sprint: Backlog Closure (2026-05-11)

## Kapsam (Bu sprintte KAPATILACAK)

### Backend
- [ ] **SEC-015 (P3):** Çek `vade_tarihi` server-default kaldır — service'de defensive default temizliği
- [ ] **CODE-005 (P3):** `createPayment` happy path integration test (server/tests/integration/)
- [ ] **CODE-007 (P3):** `seed_admin_user_role.sql` + `seed_all_users_admin.sql` deprecation/clean-up
- [ ] **SEC-012 (P3):** Helmet frontend CSP/HSTS header (Vercel response headers veya HTML meta)

### Frontend
- [ ] **CQ-01 (P3):** Dead code temizliği — `useBreakpoint`/`isMobile` artık kullanılmayan 9 sayfada deklarasyonları sil
- [ ] **A2-03 (P3):** DataTable `fixed: 'left'` sticky column (mobile horizontal scroll ergonomi)
- [ ] **A4-01 (P2):** Empty state action-oriented copy (mevcut empty state'leri tara, action-oriented Türkçe metin)
- [ ] **A5-01 (P3):** LoadingState tutarlılığı (Spin vs Skeleton standardize)
- [ ] **A8-01 (P3):** Tooltip mobile `trigger="click"` (mobile için tooltip click ile açılsın)

### U-7 ile U-12 (kozmetik)
- [ ] **U-8 (P3):** UyeDetailPage error state — Result + retry button
- [ ] **U-9 (P3):** Tag label "Başlangıç Bedeli" → "Başl. Bedeli" + ellipsis
- [ ] **U-10 (P3):** OdemeKayit çek "banka_adi" → "banka" rename audit (artık schema'da `banka` mı?)
- [ ] **U-11 (P3):** OdemeKayit `optionRender` sadeleştir
- [ ] **U-12 (P3):** `getErrorMessage` Zod array parse desteği

## Skip — Bir sonraki sprint

- **SEC-013 (P3):** JWT lokal verify (jose) — büyük auth refactor, dikkatli test
- **CODE-006 (P3):** ESLint `no-explicit-any` — codebase-wide tarama
- **A1-02 + CQ-02 (P3):** AdminLayout MainHeader refactor — büyük UI refactor
- **A2-02 (P2):** Aidatlar filtre Drawer — UX karar gerektirir
- **A3-01 (P3):** `aria-invalid` runtime doğrulaması — Playwright run'a bağlı
- **A3-02 (P2):** `validateTrigger` global standardize — form behavior değişikliği

## Doğrulama (her batch sonu)

- `cd server && npm run build` — clean
- `cd server && npx vitest run` — baseline 44/44 korunmalı
- `cd client && npx tsc --noEmit` — clean
- `cd client && npm run build` — clean

## Push Policy

Sprint sonunda her batch ayrı commit, master push. Force-push yok.
