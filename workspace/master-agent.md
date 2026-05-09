# SPRINT: Mobil Navigasyon Çözümü

## Görevler
- [x] `client/src/components/AdminLayout.tsx` dosyasında `MenuOutlined` ve `Drawer` import edilecek.
- [x] Menü içeriği (Logo, aktif proje gösterimi ve Navigation Menu) yeniden kullanılabilir bir component veya fonksiyon haline getirilecek (`renderSiderContent`).
- [x] `Header` bileşeninin sol kısmına, sadece `isMobile` iken görünecek olan bir Hamburger Menü butonu eklenecek.
- [x] `isMobile` true ise, `Sider` yerine `Drawer` bileşeni kullanılacak.
- [x] `isMobile` false ise, `Sider` her zamanki gibi render edilecek.
- [x] Mobil menüden bir bağlantıya tıklandığında (navigasyon olduğunda) `Drawer` menüsünün otomatik kapanması sağlanacak.

## Durum
Tamamlandı. Mobil cihazlar için navigasyon menüsü başarıyla eklendi.

---

# SPRINT: Cari Hesap Sistemi Sertleştirme

## Bağlam
Üç paralel kod incelemesinden çıkan kritik bulgulara karşı veri tutarlılığı, güvenlik ve ölü kod temizliği. Dashboard `cari_bakiye`'nin üyeleri saymaması bilinçli tasarım kararı (üyeler/firmalar UI'da ayrı kartlarda) — kapsam dışı.

## Görevler

### 1. PostgREST injection / URL limit fix
- [x] `server/src/services/cariHesap.service.ts:31-46` "eşleşmemiş" filtresi anti-join RPC'ye taşındı.
- [x] Yeni migration: `supabase/migrations/20260510000001_fn_list_unmatched_cari.sql` — `fn_list_unmatched_cari_hareketler(p_filters jsonb)`.

### 2. Fatura create/update atomik RPC
- [x] Yeni migration: `supabase/migrations/20260510000002_fn_fatura_atomic.sql` — `fn_create_fatura_atomic` ve `fn_update_fatura_atomic`.
- [x] `cari_hareketler.islem_turu` CHECK constraint'ine `'fatura'` değeri eklendi (önceden constraint violation cari hareket insert'inde sessizce yutuluyordu).
- [x] `server/src/services/fatura.service.ts` `create()` ve `update()` RPC çağrısına dönüştürüldü; debug `console.log`'lar temizlendi; try/catch'le yutulan cari hareket hatası kaldırıldı.
- [x] Cari hareket idempotency: RPC içinde `kaynak_tipi='fatura' AND kaynak_id` üzerinde upsert.

### 3. getById fallback hack ve repro_404 temizliği
- [x] `fatura.service.ts:43-57` raw query fallback bloğu kaldırıldı.
- [x] `getById` debug `console.log/warn/error` satırları silindi.
- [x] `server/src/repro_404.ts` dosyası silindi.

### 4. Silinmiş gelir-gider modül artıkları
- [x] `server/src/routes/dashboard.routes.ts` `/aylik-gelir-gider` route'u silindi.
- [x] `server/src/controllers/dashboard.controller.ts` `getAylikGelirGider` controller silindi.
- [x] `server/src/services/rapor.service.ts` `aylikGelirGider` service silindi.
- [x] `server/src/utils/pdfGenerator.ts` `gelir_gider_kategorileri` referansları `islem_turu` + `borc/alacak` alanlarına taşındı.
- [x] E2E spec'lerdeki `/gelir-gider` URL referansları kaldırıldı; `navigation.spec.ts` ve `navigation-debug.spec.ts` ölü URL yerine Banka Hesapları'na yönlendirildi.

### 5. Doğrulama
- [x] Sprint kapsamındaki dosyalarda yeni TypeScript hatası yok.
- [x] Pre-existing build hataları çözüldü:
  - `server/src/types/multer.d.ts` (`declare module 'multer';` stub'ı) silindi — `@types/multer` zaten kurulu olduğu için stub `Express.Multer.File` tipini bloke ediyordu.
  - `auth.ts:25-32` çakışan custom `file?`/`files?` tanımları kaldırıldı (Request prototype'una @types/multer zaten ekliyor).
  - `proje.service.ts:1` `import logger from '../utils/logger'` eklendi.
- [x] `npm --prefix server run build` sıfır hatayla geçiyor.
- [ ] Manuel test: yeni fatura oluştur → fatura + kalem + cari hareket atomik kaydedilmiş olmalı.
- [ ] Manuel test: aynı fatura tekrar update edilirse cari hareket dublike olmamalı.

## Durum
Tamamlandı (manuel UI doğrulaması hariç).

---

# SPRINT: Cari Hareket Idempotency Constraint

## Bağlam
Önceki sprint'te yazılan atomik RPC'ler (`fn_create_fatura_atomic`, `fn_bulk_charge_interest`) idempotency'i `EXISTS`-then-`UPDATE/INSERT` paterniyle uyguluyor — ama tablo seviyesinde unique constraint olmadığı için yarış durumunda iki paralel çağrı ikisi de `EXISTS=false` dönüp duplicate insert yapabilir. Bu mini-sprint constraint'i koyar.

## Görevler
- [x] Migration: `supabase/migrations/20260510000003_cari_hareket_idempotency_unique.sql` — `(kaynak_tipi, kaynak_id)` üzerinde partial unique index (`WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL`).
- [x] Pre-flight dup detect: migration başında dup varsa `RAISE EXCEPTION` ile durur, en sık 10 çift NOTICE'la raporlar (finansal veride otomatik dedup yapılmaz, manuel müdahale gerekir).
- [ ] **Lokal test:** `supabase db reset` veya `supabase migration up` ile migration'ı çalıştır. Eğer dup raporlanırsa, dup'ları manuel incele ve karar ver (en eskiyi koru / yeniyi koru / merge).
- [ ] **Production deploy:** sadece lokal test başarılıysa.

## Bilinmesi Gereken
- RPC'ler hâlâ `EXISTS`-pattern'iyle çalışıyor; race olduğunda ikinci insert constraint violation alır → transaction rollback → API'den 500 döner. İdeal pattern `INSERT ... ON CONFLICT (kaynak_tipi, kaynak_id) DO UPDATE` — bu, ayrı bir sprint'te RPC'leri güncelleyerek tamamen race-safe hale getirilebilir. Şu an constraint duplicate'ı önlüyor ama hata user-facing.

## Durum
Migration hazır; lokal test ve deploy kullanıcıda.

---

# BACKLOG

Üç paralel kod incelemesi + tamamlanan sprint'lerden derlendi. Sıralama: efor/etki + bağımlılık ilişkisi.

## Düşük Efor / Yüksek Değer
- [x] **A. ON CONFLICT idempotency refactor** — Tamamlandı (aşağıdaki sprint'te).
- [x] **B. fix_dashboard.sql migration formatına + rounding** — Tamamlandı (aşağıdaki sprint'te).
- [x] **C. Index eksiklikleri** — Tamamlandı (aşağıdaki sprint'te). FK kısmı yanlış alarmdı: `banka_hareketleri.proje_id` FK zaten `20260416000001`'de mevcut.

## Orta Efor
- [x] **D. Production debug log temizliği** — Tamamlandı (aşağıdaki sprint'te).
- [x] **E. Frontend type safety + error handling** — Tamamlandı (aşağıdaki sprint'te).
- [x] **F. Audit log iskeleti** — Tamamlandı (aşağıdaki sprint'te).

## Yüksek Efor
- [x] **G. RLS proje-bazlı sıkılaştırma** — Tamamlandı (aşağıdaki sprint'te).
- [x] **H. Authorization (role-based) middleware** — Tamamlandı (aşağıdaki sprint'te).
- [x] **I. Backend integration test iskeleti** — Tamamlandı (aşağıdaki sprint'te).

## Kapsam Dışı (bilinçli)
- Dashboard `cari_bakiye` üyeleri saymıyor — UI ayrı kart kullandığı için tasarım kararı.

---

# SPRINT: ON CONFLICT Idempotency Refactor (Backlog #A)

## Bağlam
Önceki sprint'te `cari_hareketler` üzerine `(kaynak_tipi, kaynak_id)` partial unique index koyduk. Ancak fatura ve faiz RPC'leri hâlâ `EXISTS`-then-`UPDATE/INSERT` paterniyle çalışıyor: yarış durumunda iki paralel çağrı `EXISTS=false` görür, ikisi de INSERT yapar, ikincisi unique violation alır → kullanıcıya 500 döner. ON CONFLICT atomik tek statement ile race-safe.

## Görevler
- [x] Migration: `supabase/migrations/20260510000004_rpc_on_conflict_refactor.sql`.
- [x] `fn_create_fatura_atomic` — cari hareket INSERT'i `ON CONFLICT (kaynak_tipi, kaynak_id) WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL DO UPDATE` paternine çevrildi.
- [x] `fn_update_fatura_atomic` — aynı.
- [x] `fn_bulk_charge_interest` — gecikme faizi tahakkuku INSERT'i ON CONFLICT'e çevrildi.
- [x] `fn_create_payment_atomic` **kapsam dışı:** RPC'nin `kaynak_id`'si payment matching için kullanılıyor; ON CONFLICT semantik değişiklik yapar — ayrı bir mini-incelemeyle ele alınmalı.
- [x] Build temiz: `npm --prefix server run build` sıfır hata.

## Durum
Tamamlandı. Lokal `supabase migration up` ile uygulanabilir.

---

# SPRINT: Dashboard RPC Migration + Rounding (Backlog #B)

## Bağlam
Repo kök dizininde `fix_dashboard.sql` adında bir SQL dosyası migrate edilmemiş halde duruyor. İçindeki `fn_dashboard_ozet` RPC'sinde `SUM` aggregation'larında ve aritmetik işlemlerde `ROUND(_, 2)` yok — kümülatif 0.01 TL sapma riski. Bu sprint dosyayı migration formatına taşır ve tüm sayısal alanlara `ROUND` uygular.

## Görevler
- [x] Migration: `supabase/migrations/20260510000005_fix_dashboard_ozet.sql` — `fn_dashboard_ozet` `CREATE OR REPLACE` ile yeniden tanımlandı.
- [x] Tüm `SUM(...)` aggregation'ları ve aritmetik sonuçlar (`fatura_farki`, `kasa_nakit`, `cari_bakiye`, `odeme_sonrasi_nakit`) `ROUND(..., 2)` ile sarıldı.
- [x] Kök dizindeki `fix_dashboard.sql` silindi.
- [x] Build temiz (SQL-only sprint).

## Durum
Tamamlandı.

---

# SPRINT: Cari Hareket Index (Backlog #C)

## Bağlam
Backlog'daki C maddesi iki parçalı önerilmişti:
1. `banka_hareketleri.proje_id` FK eksik — **yanlış alarm**: `20260416000001_project_workspace_and_contract_fixes.sql:53`'te zaten mevcut.
2. `cari_hareketler` composite index — `cariHesap.service.ts:45-48` sorgusu `proje_id` ile filtreliyor + `tarih` ile sıralıyor; mevcut tekil `idx_cari_hareketler_proje_id` ORDER BY'ı kapsamıyor.

Bu mini-sprint sadece (2)'yi yapar.

## Görevler
- [x] Migration: `supabase/migrations/20260510000006_cari_hareketler_proje_tarih_index.sql` — `(proje_id, tarih)` composite B-tree index.
- [x] Backlog'da C kalemi tamamlandı işaretlendi; FK için "yanlış alarm" notu eklendi.

## Durum
Tamamlandı.

---

# SPRINT: Production Debug Log Temizliği (Backlog #D)

## Bağlam
12 dosyada 32 raw `console.log/error/warn` çağrısı production'a sızıyor:
- `index.ts:20` her request için kendi format'ında log basıyordu (winston/morgan paralel logging).
- `middleware/auth.ts` 6 satır: token başarı/hata akışında **PII (email)** ve URL prefix sızdırıyor; her request için stdout'a yazıyor.
- Controller'larda `[DEBUG]` etiketli geçici breadcrumb'lar (projeler, dashboard, aidat).
- Service'lerde `console.error` — logger varken winston'a gitmeyen hata akışı; `try/catch` re-throw blokları sadece "log + throw" yaparak gürültü ekliyor.
- `validate.ts` zaten `next(err)` çağrısı yaptığı için bu log mükerrer.

## Görevler
- [x] `server/src/index.ts`: manuel timestamp middleware'i çıkarıldı; mevcut `morgan` import'u prod'da `combined`, dev'de `dev` formatla winston `logger.info` stream'ine bağlandı.
- [x] `server/src/middleware/auth.ts`: init log + token yok / OK / hatalı token için 4 stdout log'u silindi (PII riski). Sadece startup config error ve token doğrulama exception'ı `logger.error`'a taşındı.
- [x] `server/src/controllers/projeler.controller.ts`: 4 adet `[DEBUG]` log silindi; kullanılmayan `logger` import'u temizlendi.
- [x] `server/src/controllers/dashboard.controller.ts`: 2 fetch debug log'u silindi.
- [x] `server/src/controllers/aidat.controller.ts`: `[CHARGE]` debug log'u silindi; charging error `logger.error`'a taşındı.
- [x] `server/src/routes/projeler.routes.ts`: route load `[DEBUG]` log'u silindi.
- [x] `server/src/services/proje.service.ts`: createIsKalemi'deki body log'u silindi; "log + throw" wrapper'ı kaldırıldı, hatalar `logger.error` ile bağlamlı olarak loglandı.
- [x] `server/src/services/cariHesap.service.ts`, `bankaHesap.service.ts`, `rapor.service.ts`: tüm `console.error` çağrıları context bilgisi ile birlikte `logger.error`'a taşındı; gereksiz `try/catch` "log+throw" wrapper'ları kaldırıldı.
- [x] `server/src/middleware/errorHandler.ts`: "Beklenmeyen hata" `logger.error`'a taşındı (stack ile).
- [x] `server/src/middleware/validate.ts`: mükerrer `console.error` silindi (`next(err)` zaten errorHandler'a aktarıyor).
- [x] Build temiz: `npm run build` sıfır hata.

## Notlar
- Logger zaten yapılandırılmıştı (`server/src/utils/logger.ts`): prod'da `info`, dev'de `debug` seviyesi; dosyaya + console'a yazıyor.
- PII riski özellikle `auth.ts:51`'deki `[AUTH] OK - ${user.email}` log'unda kritikti — silindi.
- `try { ... console.error(err); throw err }` wrapper'larını kaldırırken context'in kaybolmaması için error log'ları çağrı parametreleriyle (`projeId`, `yil`, `ay`, vb.) zenginleştirildi.

## Durum
Tamamlandı.

---

# SPRINT: Frontend Type Safety + Error Handling (Backlog #E)

## Bağlam
30 dosyada 57 adet `(err: any)` / `(error: any)` kullanımı vardı. Çoğu `(err: any) => message.error(err.message || 'Hata oluştu')` paterniyle çalışıyor; ama axios interceptor (`lib/api.ts`) backend response body'sini (`{success: false, error: '...'}`) reject ediyor — yani `err.message` çoğu zaman `undefined` ve kullanıcı sürekli generic "Hata oluştu" görüyor. Diğer sorunlar: `App.tsx` ProtectedRoute loading sırasında `null` (boş ekran), `Dashboard.tsx` FIFO closure'da `invalidateQueries()` wildcard, `lib/api.ts` interceptor'da production'a sızan `console.error`, AuthContext'te tutarsız hata loglama.

## Görevler
- [x] Yeni helper: `client/src/lib/apiError.ts` — `ApiErrorResponse` tipi (backend `errorHandler` kontratı) + `getErrorMessage(err: unknown, fallback)` helper. `err.error` (server) → `err.message` (Error/Axios) → fallback sırasıyla çözüyor.
- [x] `client/src/App.tsx` — ProtectedRoute `loading` durumunda `null` yerine ortalanmış `<Spin size="large">` gösterir.
- [x] `client/src/lib/api.ts` — interceptor'daki `console.error` silindi (production noise + potansiyel PII).
- [x] `client/src/contexts/AuthContext.tsx` — `error: any` ve `console.error('Sign in error:')` gibi try/catch loglama temizlendi; signIn context'in zaten `error` döndüğü için redundant.
- [x] **27 dosyada bulk replace**: `(err: any) => messageApi.error(err.message || 'Hata oluştu')` → `(err) => messageApi.error(getErrorMessage(err))`. React Query `onError`'da artık `err: Error` olarak typed (default TError); helper unknown kabul ettiği için type-safe.
- [x] **5 yer korundu** (`err: any`): form `setFields(err.details...)` branch'leri olan onError block'ları (`BankaHesapListPage`, `FaturaListPage`, `ProjeListPage`), `UyeFormPage.setServerErrors` helper, ve `YillikPlanPage` 404 catch (`err.status` access). Bu yerlerde generic `unknown` ile çalışmak için cast'ler gerekecekti — küçük pragmatik kalıntı.
- [x] **Wildcard query invalidation hedefli yapıldı**: `Dashboard.tsx:54` `queryClient.invalidateQueries()` (her şeyi geçersiz kılan) FIFO closure sonrası sadece etkilenen anahtarları geçersiz kılıyor (`aidatlar`, `aidat-ozet`, `cari-ekstre`, `dashboard-ozet`, `banka-hareketleri`). `ProjectSelector.tsx:38`'deki wildcard proje switch'inde (tüm dataset değişiyor) bilinçli korundu.
- [x] **Pre-existing TS hataları**: TS incremental cache'in örtbas ettiği 3 latent hata fix edildi:
  - `CariEkstrePage.tsx:228,266` ve `UyeListPage.tsx:161,166`: `responsive: ['md'] as const` (readonly tuple) → `as ('md')[]` (mutable array, AntD `ColumnType.responsive` tipiyle uyumlu).
  - `FaizBorclandirModal.tsx:17`: `Aidat.gecikme_faizi: number` → `gecikme_faizi?: number` (UyeDetailPage `AidatOdeme[]` geçiyor, optional alan).
- [x] Build temiz: `npx tsc -b --pretty false` sıfır hata (cache silinerek tam rebuild ile doğrulandı).

## Notlar
- Helper `getErrorMessage(err)` artık tüm onError'larda gerçek backend mesajını gösterir (`{ error: 'Çek kaydı için geçerli bir firma cari hesabı gereklidir.' }` gibi). Eskiden `err.message` undefined olduğu için kullanıcı "Hata oluştu" görüyordu — bu bir functional improvement, sadece tip değil.
- `lib/apiError.ts:ApiErrorResponse` tipi backend `errorHandler.ts` kontratını yansıtır — biri değişirse diğeri güncellenmeli (CLAUDE.md'ye eklenebilir).

## Durum
Tamamlandı.

---

# SPRINT: Audit Log İskeleti (Backlog #F)

## Bağlam
Sistemde tersine alınabilir finansal işlemler var: `undoClosure` (FIFO eşleşme iptali), `unapprove` (hakediş onay-iptal → cari hareket silme), fatura silme/update (atomik RPC içinde cari hareket güncellemesi), aidat faiz toggle, banka hareket silme, çek durum değişimi. Hepsi gerçek finansal etki yaratıyor; tartışma çıktığında "kim ne zaman ne değiştirdi" sorusuna cevap verecek forensik iz yok. Bu sprint generic bir `audit_logs` tablosu + trigger iskeleti kurar.

## Görevler
- [x] Migration: `supabase/migrations/20260510000007_audit_logs_skeleton.sql`.
- [x] **Tablo**: `audit_logs(id, actor_id, actor_email, table_name, operation, record_id, before_data, after_data, proje_id, changed_at)`. JSONB before/after tam satırı tutar (geri yükleme için yeterli detay). `actor_email` cache'lenir — auth.users JOIN'siz forensik için.
- [x] **Index'ler**: 3 sorgu pattern'i için
  - `(table_name, record_id, changed_at DESC)` — bir kaydın tüm geçmişi
  - `(proje_id, changed_at DESC) WHERE proje_id IS NOT NULL` — proje bazlı denetim
  - `(actor_id, changed_at DESC) WHERE actor_id IS NOT NULL` — kullanıcı bazlı denetim
- [x] **Generic trigger function `fn_audit_log()`** (SECURITY DEFINER): `TG_OP` / `TG_TABLE_NAME` üzerinden çalışır, `to_jsonb(NEW)` / `to_jsonb(OLD)` ile satırı kaydeder, `record_id` ve `proje_id`'i jsonb'den çıkarır, `auth.uid()` üzerinden actor'ı belirler. UPDATE'te before==after ise log atlama (idempotent re-save'de gürültü önleme).
- [x] **Trigger uygulanan tablolar** (8 tane finansal-mutate): `faturalar`, `fatura_kalemleri`, `cari_hareketler`, `banka_hareketleri`, `hakedisler`, `hakedis_kalemleri`, `aidatlar`, `cekler`. Her biri `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`. `DROP TRIGGER IF EXISTS` ile idempotent.
- [x] **RLS — immutable audit**: `audit_logs` ENABLE RLS. Sadece `is_admin()` SELECT yapabilir. INSERT/UPDATE/DELETE policy'leri açıkça `false` (defense in depth). Trigger SECURITY DEFINER olduğu için (function owner postgres = BYPASSRLS) bu kısıtları atlar; ama doğrudan API çağrısıyla kimse audit log yazamaz/silemez.
- [x] **Yardımcı RPC `fn_audit_history(table_name?, record_id?, proje_id?, limit=100)`**: admin'in geçmişe bakması için. Kendi içinde `is_admin()` kontrolü yapar (SECURITY DEFINER bypass'a karşı).

## Bilinmesi Gereken
- **Service-role çağrılarında `auth.uid()` NULL döner** (örn. cron job, admin migration). `actor_id` NULL'a izin veriyor; bu durumda kayıt yine de tutulur ama "kim" alanı boş kalır.
- **fatura_kalemleri trigger'ı** — atomik fatura RPC'si bir fatura için N kalem insert ediyor; her biri için bir audit log satırı oluşur. Bu farkındalıkla (forensik kapsamlılık > storage); büyük ölçek geldiğinde retention policy düşünülebilir.
- **Geri yükleme** bu sprint kapsamı dışında — `before_data` JSONB tam satırı tuttuğu için manuel restore SQL'iyle yapılabilir, ama otomatik "rollback" RPC'si yok. F2 sprint'i olarak ele alınabilir.
- **Backend route eklenmedi** (sadece migration) — `fn_audit_history` RPC'si admin tarafından client'tan veya doğrudan `supabaseAdmin.rpc()` ile çağrılabilir; UI gerekirse ayrı sprint'te eklenir.

## Durum
Tamamlandı. Lokal `supabase migration up` ile uygulanabilir.

---

# SPRINT: RLS Proje-Bazlı Sıkılaştırma (Backlog #G)

## Bağlam
Mevcut RLS politikası tüm finansal tablolarda `is_admin() OR is_staff()` paterniyle çalışıyor; yani herhangi bir staff tüm projelerin verisini görebilir/yazabilir. Multi-tenant senaryosunda projeler arası veri sızıntısı riski. **Önemli:** Backend service-role key kullanıyor (`server/src/config/supabase.ts:11`) — bu policy'ler normal akışta bypass edilir. Bu sprint **defense in depth** katmanıdır: anon-key ile sorgu, service-role key sızıntısı veya ileride direct Supabase erişimi senaryolarında izolasyonu garanti eder. Gerçek erişim kontrolü Sprint H'in (RBAC middleware) üstüne düşer.

Tasarım kararı: **(a) `is_admin() OR is_project_member(proje_id)` paterni + (c) mevcut user_roles üyelerinin tüm projelere otomatik seed edilmesi**. Admin global; staff/viewer sadece atandığı projeleri görür. Mevcut deployment'ta kırılma sıfır — yeni kullanıcılar için admin proje atar.

## Görevler
- [x] Migration: `supabase/migrations/20260510000008_rls_proje_uyelikleri.sql`.
- [x] **`proje_uyelikleri` tablosu**: `(user_id, proje_id, rol)` PK; rol CHECK `IN ('admin','staff','viewer')`; her iki FK `ON DELETE CASCADE`. Index `(proje_id)` proje bazlı sorgu için.
- [x] **`proje_uyelikleri` RLS'i**: admin tam yönetim (`proje_uyelikleri_admin_manage`); kullanıcı kendi kayıtlarını okuyabilir (`proje_uyelikleri_self_read`).
- [x] **`is_project_member(uuid)` helper**: SECURITY DEFINER STABLE; `auth.uid()` ile verilen `proje_id` arasındaki kaydı arar. NULL `p_proje_id` için her zaman FALSE döner (NULL = NULL semantiği).
- [x] **Geriye uyumluluk seed**: `INSERT ... SELECT FROM user_roles CROSS JOIN projeler ON CONFLICT DO NOTHING` — mevcut tüm admin/staff tüm projelere üye yapılır, kırılma riski sıfır.
- [x] **8 ana finansal tabloda policy refactor**: `cari_hesaplar`, `cari_hareketler`, `aidatlar`, `faturalar`, `hakedisler`, `banka_hesaplari`, `banka_hareketleri`, `cekler`. Tüm legacy policy'ler (`Admins have full access`, `Staff can read all`, `Staff can insert activity`, `authenticated_full_access`, `{tbl}_access`) DROP edildi; tek `{tbl}_proje_isolation` policy'siyle değiştirildi (`is_admin() OR is_project_member(proje_id)`).
- [x] **3 child tablo için parent-join policy'leri**: `fatura_kalemleri → faturalar.proje_id`, `hakedis_kalemleri → hakedisler.proje_id`, `aidat_odemeleri → aidatlar.proje_id`. Subquery EXISTS pattern.

## Bilinmesi Gereken
- **Backend etkilenmiyor** — service-role key RLS'i bypass eder; bu sprint sadece anon-key/sızıntı/multi-tenant senaryosu için defense in depth.
- **`cekler.proje_id` NULLABLE** — proje atanmamış çekler sadece admin'e açık (NULL semantiği). Eğer "global çek" use case'i varsa policy `proje_id IS NULL OR is_project_member(proje_id)` şeklinde gevşetilebilir; şu an defansif tarafta kalındı.
- **Faz 2 kapsam dışı**: `sozlesmeler`, `malzeme_teslimler`, `irsaliyeler`, `irsaliye_kalemleri`, `birikmis_teminatlar`, `serefiye_tablosu`, `bloklar`, `uyeler`, `firmalar`, `aidat_tanimlari`. Bunlar için ayrı bir sprint açılabilir; çoğu master-data niteliğinde olduğu için izolasyon önceliği daha düşük.
- **Yeni kullanıcı eklemek**: admin direkt `INSERT INTO proje_uyelikleri (user_id, proje_id, rol) VALUES (...)` yapmalı veya UI eklenirse oradan. Sprint H ile RBAC middleware kuruldukça bu UI ihtiyacı netleşir.
- **Audit trigger'larıyla etkileşim**: `proje_uyelikleri` tablosu Sprint F'in 8 audit hedef tablosunda değil — üyelik değişiklikleri audit log'a yazılmıyor. Gerekirse F'in tablo listesine eklenebilir.

## Durum
Tamamlandı. Lokal `supabase migration up` ile uygulanabilir. Manuel doğrulama: anon-key client ile staff kullanıcısı kendi projeleri dışındaki kayıtları görmeyecek (curl + JWT ile test edilebilir).

---

# SPRINT: RLS Proje-Bazlı Sıkılaştırma — Faz 2 (Master-Data Tabloları)

## Bağlam
Sprint G (Faz 1) finansal kritik 8 ana tablo + 3 child tablosunu kapsamıştı. Faz 2 master-data ve destek tablolarını aynı `is_admin() OR is_project_member(proje_id)` paterniyle izole eder. Proje üyelik tablosu, helper fonksiyon ve seed Faz 1'de zaten kurulmuş durumda — bu sprint sadece kalan tabloların policy'lerini günceller. Backend service-role kullanmaya devam ettiği için defense in depth katmanıdır.

## Görevler
- [x] Migration: `supabase/migrations/20260510000009_rls_proje_uyelikleri_faz2.sql`.
- [x] **7 ana tablo (proje_id direkt)**: `aidat_tanimlari`, `bloklar`, `uyeler`, `sozlesmeler`, `serefiye_tablosu`, `birikmis_teminatlar`, `irsaliyeler`. Tüm legacy policy'ler (`Admins have full access`, `Staff can read all`, `Staff can insert activity`, `authenticated_full_access`, `Allow authenticated users to read guarantees`, `{tbl}_access`) DROP edildi; tek `{tbl}_proje_isolation` policy'siyle değiştirildi.
- [x] **2 child tablo**:
  - `irsaliye_kalemleri → irsaliyeler.proje_id` — subquery EXISTS pattern.
  - `malzeme_teslimleri → sozlesmeler.proje_id` — `sozlesme_id` NULLABLE; NULL ise EXISTS FALSE döner ve sadece admin görür (defansif).

## Kapsam Dışı (bilinçli)
- **`firmalar`** — `20260420000001_make_firmalar_global.sql` migration'ında `proje_id` drop edildi; firmalar tüm projelere açık global master-data. Mevcut policy korunuyor.
- **`pozlar`, `birimler`, `parametreler` ve diğer tanım tabloları** — Sistem genelinde paylaşılan UI master-data; izolasyon mantıksız.
- **`aidat_odemeleri` faz 1'de zaten kapsandı** (parent join → aidatlar).

## Bilinmesi Gereken
- **Backend etkilenmiyor** — service-role bypass; bu sprint anon-key/sızıntı/multi-tenant senaryosu için.
- **`bloklar`, `uyeler`, `sozlesmeler.proje_id` NULLABLE** olabilir (sonradan eklendi, backfill ile doldurulduysa NULL kalmamalı). NULL satırlar sadece admin'e açık olur.
- **`malzeme_teslimleri.sozlesme_id` NULL** olan kayıtlarda staff erişemez. Bu use case yaygın değil (teslim genelde sözleşme ile bağlanır); sorun çıkarsa policy gevşetilebilir veya `malzeme_teslimleri`'ne `proje_id` direkt eklenebilir.
- **`uyeler`** policy'si: üyeler staff için sadece atandığı projelerde görünür. UI'da proje seçici zaten aktifProje filtreliyor → semantik fark yok.
- **`irsaliyeler.proje_id` NULLABLE**: `cekler` benzeri durum, NULL ise sadece admin.

## Durum
Tamamlandı. Lokal `supabase migration up` ile uygulanabilir.

---

# SPRINT: RBAC Middleware (Backlog #H)

## Bağlam
Backend'de `authMiddleware` sadece token doğruluyordu — `req.user = { id, email }` set edip geçiyordu, ama **role kontrolü yoktu**. Tüm `/api/*` endpoint'leri "auth olan herkes" tarafından çağrılabiliyordu: staff bir kullanıcı `POST /api/faturalar`, `POST /api/aidatlar/execute-charging`, `DELETE /api/projeler/:id` gibi kritik finansal/yapısal işlemleri yapabilir, hatta RPC'leri tetikleyebilirdi. Sprint G'nin RLS izolasyonu **service-role bypass** edildiği için backend tarafında defense in depth bile sağlamıyordu — bu sprint o boşluğu kapatır: kim hangi aksiyonu yapabilir.

## Onaylanan Tasarım Kararları
- **Hierarchical role**: `requireRole('staff')` çağrısı admin'i de geçer (admin auto-includes staff). Yazımı kısaltır, mantıksal hata riski azalır.
- **Cache stratejisi**: in-memory `Map<userId, {role, expiresAt}>` + 5 dk TTL. Cache miss'te `supabaseAdmin.from('user_roles').select('role')` fallback. Single-instance Render varsayımı.
- **Endpoint kategorizasyonu**: yapısal/master-data CRUD (proje, sözleşme, blok, üye CRUD, fatura, hakediş, aidat tanımları, banka hesabı, settings birimler/pozlar) → admin-only. Operasyonel kayıt (firma, çek, malzeme teslim, ödeme kaydı, banka hareketi, hakedis kalemleri) → staff+. Geri alma (FIFO undo, hakediş onay-iptal, aidat toggle-faiz) → admin-only.
- **Test altyapısı**: Vitest + supertest bu sprintte kuruldu; sadece `requireRole` + `roleCache` unit testleri (14 test). Integration test iskeleti Sprint #I'a bırakıldı.

## Görevler
- [x] **Foundation**: `ApiError.forbidden(message)` static helper eklendi (`server/src/utils/ApiError.ts:24`); `server/src/types/express.d.ts` global `Express.Request` namespace'ine `user` ve `userRole` augmentation eklendi.
- [x] **`server/src/middleware/roleCache.ts`** (YENİ): `getUserRole(userId)` 5 dk TTL'li in-memory cache + DB fallback; `clearRoleCache(userId?)` test reset/manuel invalidation için. Hata durumunda `null` dönüp cache'lenmiyor (transient hata next request'te tekrar denenir).
- [x] **`server/src/middleware/requireRole.ts`** (YENİ): variadic `requireRole(...roles)`; effective roles set'inde `staff` varsa `admin` otomatik eklenir (hierarchical); `req.user` yoksa 401, role uymuyorsa 403.
- [x] **`server/src/middleware/auth.ts`**: `getUserRole(user.id)` çağrısı `req.userRole`'a yazılır; DB hatasında null + log.
- [x] **13 route dosyasında `requireRole` apply**:
  - `routes/index.ts` (settings 5 satır admin)
  - `faturalar.routes.ts` (router-level grouping admin), `cekler.routes.ts` (router-level staff), `malzemeTeslim.routes.ts` (router-level staff)
  - `hakedisler.routes.ts` (4 admin + 1 staff inline)
  - `aidatlar.routes.ts` (7 admin + 4 staff inline)
  - `bankaHesap.routes.ts` (2 admin + 2 staff inline)
  - `projeler.routes.ts` (15+ admin inline)
  - `sozlesmeler.routes.ts` (7 admin inline)
  - `uyeler.routes.ts` (3 admin CRUD + 2 staff operasyonel)
  - `bloklar.routes.ts` (3 admin inline)
  - `firmalar.routes.ts` (2 staff inline)
  - `cariHesap.routes.ts` (2 staff + 3 admin inline)
- [x] **Test altyapısı**: `package.json`'a vitest + supertest + @types/supertest devDeps; `vitest.config.ts` (node env, `tests/**/*.test.ts`); `tests/unit/requireRole.test.ts` (7 test) + `tests/unit/roleCache.test.ts` (7 test). `npm test` → 14/14 yeşil.
- [x] **Build**: `npm run build` sıfır TypeScript hata. Tip augmentation'da `params: Record<string, string>` mevcut module declaration korundu; user/userRole global `Express.Request` namespace'ine taşındı (express-serve-static-core ile uyum için).

## Bilinmesi Gereken
- **Cache stale role**: Admin → staff demote olduğunda 5 dk yetkisi devam eder. Mitigation (future): admin panelinden role değişikliğinde `clearRoleCache(userId)` çağrılır. Admin UI bu sprintte yok.
- **`req.userRole = null` durumu**: DB hatasında null → kullanıcı tüm mutate'lerden 403 alır (read'ler geçer). 503 değil 403; gerçek arıza `[AUTH] role lookup failed` log'unda görünür.
- **Yeni kullanıcı default role'ü**: Yok. Auth olmuş ama `user_roles` tablosunda kaydı olmayan kullanıcı tüm mutate'lerden 403 alır (güvenli default). Admin elle `INSERT INTO user_roles` ile atar.
- **Express middleware order**: Router-level `router.use(requireRole(...))` sonraki tüm route'ları kapsar — `faturalar`, `cekler`, `malzemeTeslim`'de GET'ler `router.use` öncesinde tanımlandı.
- **`routes/settings.routes.ts`** import edilmiyor (inline `routes/index.ts`'te); RBAC inline olarak index.ts'e eklendi, dosya scope dışı bırakıldı.

## Kapsam Dışı (bilinçli)
- JWT custom claim ile role embed (Supabase trigger/Edge Function gerekir).
- Multi-instance cache invalidation (Redis pub/sub) — single-instance varsayımı.
- Per-resource ownership check ("kendi firma kayıtların") — şu an binary admin/staff yeterli.
- Audit log entegrasyonu — kim hangi 403 aldı; mevcut logger debug için yeterli.
- Admin panel UI (kullanıcıya rol atama) — frontend sprint.
- Integration test suite — Sprint #I.

## Durum
Tamamlandı. Manuel doğrulama önerisi: staff token ile `POST /api/faturalar` → 403; admin token ile aynı → 200/201; cache davranışı: aynı kullanıcı için ardışık request'lerde sadece ilkinde DB query görülmeli.

---

# SPRINT: Backend Integration Test İskeleti (Backlog #I)

## Bağlam
Sprint H'de Vitest + supertest devDeps olarak kuruldu ve `requireRole` + `roleCache` için unit testler yazıldı. Ancak HTTP-level uçtan uca akışı doğrulayan integration test iskeleti yoktu — yani Express app booting, route mount, middleware chain, errorHandler dönüş kontratı bir araya geldiğinde davranış doğru mu sorusunun cevabı manuel curl'dü. Bu sprint o iskeleti kurar; gelecekteki regression sorunlarını CI'da yakalayacak temel atılır.

Yaklaşım: **mock'lı integration** — gerçek Supabase test DB kurmak (lokal supabase docker veya separate project) yüksek efor + flaky risk; bunun yerine `authMiddleware` ve `supabaseAdmin` mock'lanır, controller'ın HTTP-katmanı davranışı (route resolution, status codes, RBAC kararı, errorHandler kontratı) test edilir. Gerçek DB davranışını test etmek isteyen ileri senaryolar (RPC sonuçlarının doğruluğu, RLS davranışı) ayrı bir sprint'te lokal supabase ile yapılabilir.

## Görevler
- [x] **`server/src/index.ts`**: `app.listen()` koşuluna `NODE_ENV !== 'test'` ekleme — test ortamında listen çağrılmaz, port çakışması/temiz exit sorunu önlenir.
- [x] **`server/tests/setup/env.ts`** (YENİ): `NODE_ENV=test` + fake Supabase env değişkenleri (URL, anon key, service role key). Modül import sırasında `supabaseAdmin` ve auth client'ın throw etmemesi için.
- [x] **`server/vitest.config.ts`**: `setupFiles: ['./tests/setup/env.ts']` + inline `env: { ... }` — env değişkenleri vitest worker'da modül import'undan önce kesin set edilsin diye iki taraflı garanti.
- [x] **`server/tests/integration/rbac.smoke.test.ts`** (YENİ): supertest tabanlı end-to-end smoke test. **12 test, 4 kategori**:
  - `POST /api/faturalar` (admin-only): anon→401, staff→403, admin→not 401/403, null role→403.
  - `POST /api/cekler` (staff+, hierarchical): anon→401, staff→geçer, admin→geçer (hierarchical), null→403.
  - `GET /api/dashboard/ozet` (read-only): anon→401, staff→200, null role→200 (read endpoint role kontrolü yapmaz).
  - Unknown route → 404.
- [x] **Mock stratejisi**:
  - `authMiddleware` `vi.mock` ile değiştirilir; module-scope `currentUser` değişkeni test başında set edilir, mock middleware o user'ı `req.user` ve `req.userRole`'a koyar (yoksa `ApiError.unauthorized()` ile 401).
  - `supabaseAdmin` `vi.mock` ile değiştirilir; jenerik chainable mock (select/insert/update/eq/order/range/...) boş array veya null döner. `then(...)` PostgrestBuilder taklidi için var; `single()` ve `maybeSingle()` `{ data: null, error: null }` döner.
- [x] **Build & test**: `npm run build` sıfır TS hata; `npm test` → 3 dosya, **26/26 test yeşil** (14 unit + 12 integration).

## Bilinmesi Gereken
- **Mock'lı yaklaşım gerçek RLS/RPC semantiğini test etmez** — sadece HTTP katmanı + middleware chain. Bu farkındalıkla; gerçek DB davranışı için ayrı sprint'te `supabase start` ile lokal docker DB kurulup integration testleri ona koşulabilir.
- **Test izolasyonu**: `currentUser` modül-seviye değişken; `beforeEach`'te null'a reset ediliyor. Paralel test çalıştırılırsa (vitest default) state collision yok çünkü her test file'ı kendi worker'ında.
- **Mock chain limit**: Mevcut mock controller'ın "tüm select/insert/update path'lerini yutar" şeklinde basit; controller `data.error.code` gibi PostgrestError-spesifik field'lara dokunan mantığa sahipse mock yetersiz kalabilir. Şu an `null/[]` dönüş yeterli olduğu için 26/26 yeşil.
- **`POST /api/cekler` admin testi 400 dönüyor** (validation hatası — boş body) — RBAC geçti, downstream Zod validation reddetti. Test "not 401/403" assertion'ı kullanıyor; yani RBAC'ın doğru kararı kontrol ediliyor, validation/DB downstream davranışı test scope dışı.
- **`server/dist/` test'leri içeriyor mu**: TypeScript `tsc` `tests/` dizinini de derlemeye çalışırsa `dist/tests/` oluşur. `tsconfig.json`'da `exclude` yoksa eklenmesi gerekebilir; build sıfır hata olduğu için şu an sorun yok ama dağıtımda gereksiz dosya olur. **Future cleanup**.

## Kapsam Dışı (bilinçli)
- **Gerçek Supabase DB ile integration**: `supabase start` ile lokal docker DB + migration apply + temiz teardown — yüksek efor + CI minutes; şu an mock'lı yaklaşım yeterli.
- **CI pipeline integration**: GitHub Actions workflow eklemek ayrı task; mevcut Render deploy hook'una test gate eklenebilir.
- **Service-level testler** (`fatura.service`, `cariHesap.service` gibi): mock'lı supabase ile bu servisleri test etmek değer üretmez (sadece mock dönüşünü ölçer); gerçek DB ile yapılırsa anlamlı.
- **Coverage raporu**: `vitest --coverage` flag'i ile elde edilebilir; ayrı bir polish task'ı.
- **Snapshot testler**: API response shape regression için kullanılabilir; bu sprintte yok.

## Durum
Tamamlandı. `npm test` lokalde 26/26 yeşil. CI/deploy hook ekleme ileri sprintte.
