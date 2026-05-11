# Sprint Closure — Backlog P3 Final (2026-05-11 gece)

## Özet

14 P3/P2 task kapatıldı, 6 task bilinçli skip edildi (yüksek risk / kapsam). 3 atomik commit, master'a push edilecek.

## Commits

| Hash | Batch | Kapsam |
|------|-------|--------|
| `81d1178` | 1 — cosmetic + cleanup | U-9, U-11, U-12, CODE-007, SEC-015 |
| `6878fde` | 2 — frontend UX | A2-03, A4-01, A5-01, A8-01, U-8 |
| `35eca5d` | 3 — security + test | SEC-012 (CSP/HSTS), CODE-005 (createPayment test) |

## Kapatılanlar — Task Detayı

### Backend / Schema / Infra

- **SEC-015 (P3) — Çek vade_tarihi defensive guard**
  - `server/src/services/cariHesap.service.ts:173-177`: comment netleştirildi, defensive guard sigorta olarak korundu (service-içi doğrudan çağrı path'i için).
- **CODE-005 (P3) — createPayment happy path integration test**
  - `server/tests/integration/createPayment.happyPath.test.ts`: yeni dosya, 6 test (staff 201, admin 201, anon 401, null-role 403, tutar negatif 400, uyelik_baslangic+banka_hesap_id superRefine 400).
- **CODE-007 (P3) — Seed admin migration deprecation**
  - `supabase/migrations/20260510000010_seed_admin_user_role.sql` + `20260510000011_seed_all_users_admin.sql`: deprecation header eklendi. Dosyalar silinmedi (migration history bütünlüğü); production'da idempotent NOOP olarak korunuyor. Rollback SQL açıklamada.
- **SEC-012 (P3) — Helmet frontend CSP/HSTS**
  - `client/vercel.json`: 6 güvenlik header eklendi (HSTS preload, CSP, X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/mic/geo/payment/usb=()). CSP `connect-src` Supabase + Render whitelisted; `script-src 'unsafe-inline' 'unsafe-eval'` AntD ve Vite bundle uyumu için.

### Frontend UX / Component

- **A2-03 (P3) — DataTable sticky first column**
  - `client/src/components/common/DataTable.tsx`: `stickyFirstColumn?: boolean` prop, opt-in. İlk kolona otomatik `fixed: 'left'` enjekte eder (zaten user fixed verdiyse override etmiyor).
  - `client/src/pages/uyeler/UyeListPage.tsx` + `firmalar/FirmaListPage.tsx`: aktif edildi.
- **A4-01 (P2) — Action-oriented empty state copy + CTA**
  - `client/src/components/common/EmptyState.tsx`: action prop zaten vardı, kullanılır hale getirildi.
  - `client/src/pages/projeler/ProjeListPage.tsx`: "Henüz proje eklenmemiş" → "Henüz bir projeniz yok. Başlamak için ilk projenizi oluşturun." + Primary CTA "İlk Projeyi Oluştur".
  - `client/src/pages/projeler/ProjeDetailPage.tsx`: "Proje bulunamadı" → "Bu proje bulunamadı veya silinmiş olabilir." + "Projeler Listesine Dön" action.
  - `client/src/pages/uyeler/UyeListPage.tsx`: emptyDescription "Kayıtlı üye bulunamadı" → "Bu projede kayıtlı üye yok. Yeni Üye butonu ile başlayın."
- **A5-01 (P3) — LoadingState tutarlılığı**
  - `client/src/components/common/LoadingState.tsx`: `role="status"` + `aria-busy="true"` + `aria-live="polite"` (a11y); `inline?: boolean` prop (küçük alanlar için). Codebase Spin-only zaten tutarlıydı, eklemeler accessibility kazancı.
- **A8-01 (P3) — Tooltip mobile click trigger**
  - `client/src/hooks/useIsTouchDevice.ts`: yeni hook, SSR-safe matchMedia `(hover: none) and (pointer: coarse)`.
  - `client/src/pages/uyeler/UyeDetailPage.tsx`: undo-flow Tooltip (NO_UNDO_TYPES için info ikonu) — `trigger={isTouchDevice ? ['click', 'hover'] : ['hover']}`, cursor `pointer` (touch) / `help` (desktop), aria-label eklendi.
- **U-8 (P3) — UyeDetailPage error state Result + retry**
  - `client/src/pages/uyeler/UyeDetailPage.tsx`: useQuery'den `isError`, `error`, `refetch` çekildi. Render path'inde guard: `uyeLoading` → LoadingState, `uyeIsError || !uye` → ErrorState (`title` ile "Üye yüklenemedi" / "Üye bulunamadı" ayrımı + `onRetry={uyeRefetch}`).
- **U-9 (P3) — Tag label kısaltma**
  - `client/src/pages/uyeler/UyeDetailPage.tsx`: islemTuruMeta `uyelik_baslangic.label` `'Başlangıç Bedeli'` → `'Başl. Bedeli'` (col width 140 sığar).
- **U-11 (P3) — OdemeKayit optionRender sadeleştirme**
  - `client/src/pages/cariHesap/OdemeKayit.tsx`: option `render` field indirection kaldırıldı; option data'sına `cariTuru` + `cariAdi` field'ları eklendi, optionRender doğrudan bunlardan JSX üretiyor.
- **U-12 (P3) — getErrorMessage Zod array desteği**
  - `client/src/lib/apiError.ts`: `details: ApiErrorIssue[]` parse desteği; generic mesajlarda (`/validasyon|geçersiz/i`) field-level mesaj öne çıkar; `__debug` field'ları skip. Yeni `toFormFields(err)` helper — AntD Form `setFields` formatına çevirir.

### CQ-01 — Doğrulandı

`useBreakpoint`/`isMobile` kullanımı sadece `AdminLayout.tsx`'te kaldı; orada da hala aktif kullanılıyor (navigation collapse + siderProps). Pages tarafı zaten önceki sprintlerde temizlenmişti. AdminLayout refactor A1-02/CQ-02 task'ı olup skip listesinde.

### U-10 — Doğrulandı

OdemeKayit'te çek için `name="banka"` (Form.Item, line 290) zaten kullanılıyor; `banka_adi` sadece banka_hesap query response field olarak kalmış (DB'den dönen banka hesap adı). Rename gerekmiyor.

## Bilinçli Skip (sonraki sprint)

| Task | Sebep |
|------|-------|
| **SEC-013** JWT lokal verify (jose) | Büyük auth refactor, dikkatli test gerekir |
| **CODE-006** ESLint no-explicit-any | Codebase-wide tarama, 100+ warning, ayrı sprint |
| **A1-02 + CQ-02** AdminLayout MainHeader refactor | UI regression riski büyük, ayrı dikkat |
| **A2-02** Aidatlar filtre Drawer | UX değişikliği, kullanıcı karar gerekebilir |
| **A3-01** aria-invalid Playwright doğrulaması | Playwright full run'a bağlı |
| **A3-02** validateTrigger global standardize | Form behavior değişikliği, kontrollü test |

## Doğrulama

```
server/ npm run build         → CLEAN
server/ npx vitest run        → 50 passed (44 baseline + 6 createPayment)
client/ npx tsc --noEmit      → CLEAN
client/ npm run build         → CLEAN (2.19 MB / 618 KB gzip)
```

## Push / Deployment

- Master branch'e 3 commit eklendi (81d1178, 6878fde, 35eca5d).
- `git push origin master` ile auto-deploy:
  - **Vercel** (client): yeni vercel.json headers aktif olacak. CSP violation'ları DevTools Console'dan kontrol.
  - **Render** (server): yeni integration test deploy etkilemez (test-time only).
- Supabase migration eklenmedi (CODE-007 sadece comment, schema değişmedi).

## Notes for tomorrow

1. Vercel preview CSP doğrulaması — Console'da `Refused to connect` veya `Refused to execute` görürsen vercel.json'da `connect-src` veya `script-src` listesine ekle.
2. UyeDetailPage'de error state behavior'ı: API down olduğunda Result + "Tekrar dene" görünüyor mu manuel test.
3. UyeList/FirmaList mobile (375px) görünümde ilk kolon sticky çalışıyor mu — horizontal scroll yapınca soldaki kolon kayboluyorsa override gerek.
