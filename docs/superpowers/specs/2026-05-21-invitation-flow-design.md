# Davet Akışı Yeniden Tasarımı — Spec

**Tarih:** 2026-05-21
**Sprint hedefi:** Yeni kullanıcı davet akışında OTP doğrulama + kayıtlı kullanıcılar için kabul/red bildirimi.
**İlişkili PR'lar:** sprint-2 P0 cross-PR tutarsızlığını kapatır; `role-system-v2` (PR #71–#75) üzerine inşa edilir.

---

## 1. Context

Mevcut davet akışında iki sorun var:

1. **Davet linki `/login`'e düşüyor.** Backend `auth.admin.inviteUserByEmail` ile `redirectTo=/sifre-belirle` geçiyor ancak production'da Supabase Auth URL configuration / `APP_PUBLIC_URL` eksikliği veya magic-link parse problemi nedeniyle kullanıcı `/login` ekranında kalıyor.
2. **Mail linkini ele geçiren herhangi biri signup tamamlayabiliyor.** Tek tabaka güvenlik (mail erişimi) yeterli kabul edilmiyor; ek bir doğrulama katmanı isteniyor.
3. **Kayıtlı kullanıcı davet edilince hiç bildirim almıyor.** Backend `proje_uyelikleri` row'unu sessizce upsert ediyor; kullanıcı bir sonraki login'de farkında olmadan yeni projeye erişim kazanıyor — kabul/red seçeneği yok.

Bu spec, davet akışını iki kullanıcı tipi (yeni vs. kayıtlı) için ayrı UX ile yeniden tasarlar; OTP doğrulama, brute-force koruması ve in-app kabul/red bildirimi ekler.

---

## 2. Tasarım Kararları

Brainstorming sonucu netleşen seçimler:

| Karar | Seçim | Gerekçe |
|---|---|---|
| OTP teslim yöntemi | Tek mail (link + 6 haneli kod) | Mail trafiği minimum, UX basit; brute-force koruma diğer katmanlarla sağlanır. |
| Brute-force koruma seviyesi | Orta sıkı | Attempt-lockout (5 yanlış) + IP rate-limit (5/dk, 30/saat) + TTL kısa; CAPTCHA gereksiz. |
| Bildirim yeri (kayıtlı kullanıcı) | Login sonrası üst banner + Projeler listesi badge | Yüksek görünürlük; kullanıcı görmezden gelemez. |
| Red davranışı | Soft red — `status='rejected'` kalır | Audit + owner re-invite mümkün; veri kaybı yok. |
| Davet/OTP TTL | 7 gün | Hafta sonu/tatil pratiği için makul; brute-force koruması attempt-lockout'la sağlanır. |
| Pending davet erişimi | Hayır — kabul edene kadar erişim yok | `proje_uyelikleri` sadece `active` üyeleri tutar; RLS değişmez. |

---

## 3. Mimari & İki Akış

### 3.1 Yeni Kullanıcı (e-mail sistemde yok)

```
[Owner] Davet Et
   │
   ▼
[Backend] invitations INSERT (token + otp_hash + expires_at=+7gün, user_id=NULL)
[Backend] Mail gönder (link + 6 haneli kod)
   │
   ▼
[Kullanıcı] Linki tıklar → /davet-kabul/:token (public route)
   │
   ▼
[DavetKabulPage] GET /api/invitations/by-token/:token → form preview
   │
   ▼ (e-mail read-only + OTP + şifre + tekrar)
[Kullanıcı] Submit → POST /api/invitations/accept-by-token
   │
   ▼
[Backend] OTP verify (Argon2) → createUser + proje_uyelikleri INSERT + invitations status='accepted'
[Frontend] supabase.auth.signInWithPassword → / redirect
```

### 3.2 Kayıtlı Kullanıcı (e-mail sistemde var)

```
[Owner] Davet Et
   │
   ▼
[Backend] invitations INSERT (token=NULL, otp_hash=NULL, user_id=mevcut)
[Backend] Mail gönder (bilgilendirme — uygulamadan onayla)
   │
   ▼
[Kullanıcı] Login → AdminLayout → InvitationBanner GET /api/me/invitations
   │
   ▼
[Banner] "X projesi için davet edildiniz. [Kabul Et] [Reddet]"
   │
   ├─[Kabul] POST /api/me/invitations/:id/accept → proje_uyelikleri INSERT
   └─[Reddet] POST /api/me/invitations/:id/reject → status='rejected'
```

### 3.3 Brute-Force Koruma Katmanları

- **OTP hash karşılaştırma:** Argon2id; plaintext kod hiç saklanmaz, log'a yazılmaz.
- **Attempt-lockout (token başına):** 5 yanlış kod denemesi → `status='expired'`; tekrar davet gerekir.
- **IP rate-limit:** `POST /api/invitations/accept-by-token` ve `GET /api/invitations/by-token/:token` için IP başına dakikada 5, saatte 30 hit.
- **TTL:** 7 gün (`expires_at` check); süresi geçen davet otomatik expired.
- **Audit log:** tüm accept/reject/yanlış-OTP denemeleri `audit_logs` tablosuna yazılır.

---

## 4. Veritabanı

### 4.1 Yeni Tablo: `invitations`

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id      UUID NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
  email         CITEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_role  VARCHAR(16) NOT NULL CHECK (invited_role IN ('manager','user')),
  invited_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  token         TEXT UNIQUE,
  otp_hash      TEXT,
  attempt_count INT NOT NULL DEFAULT 0,

  status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','expired')),

  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  rejected_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_invite_active
  ON invitations (proje_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_invite_user_pending ON invitations (user_id, status) WHERE status = 'pending';
CREATE INDEX idx_invite_proje_status ON invitations (proje_id, status);
CREATE INDEX idx_invite_token        ON invitations (token) WHERE token IS NOT NULL;
```

### 4.2 RLS

```sql
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Owner/manager kendi projesinin davetlerini görür
-- is_project_manager() helper'ı mevcut: owner VEYA manager'a true döner
-- (supabase/migrations/20260520000010_role_v2_expand.sql)
CREATE POLICY invitations_read_owner_manager ON invitations FOR SELECT
  USING (is_project_manager(proje_id));

-- Kullanıcı kendi user_id'sine ait davetleri görür (banner)
CREATE POLICY invitations_read_self ON invitations FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE service-role üzerinden (backend kontrolü)
-- Public accept-by-token endpoint backend service-role kullanır
```

### 4.3 Audit Trigger

`fn_audit_invitations` — mevcut `fn_audit_proje_uyelikleri` pattern'i kullanılarak. `audit_logs` tablosuna `table_name='invitations'` ile INSERT/UPDATE event'leri yazar.

### 4.4 `proje_uyelikleri` Dokunulmaz

Pending durum `invitations` tablosunda tutulur; `proje_uyelikleri` yalnız `active` üyeleri tutar. Mevcut RLS politikaları (`is_project_member`) değişmez.

### 4.5 Migration Dosyaları

- `20260522000001_invitations_table.sql` — tablo + index + RLS policy
- `20260522000002_fn_audit_invitations.sql` — audit trigger

---

## 5. Backend

### 5.1 Yeni Servis: `server/src/services/invitation.service.ts`

| Fonksiyon | Görev |
|---|---|
| `createInvitation(body, invitedBy)` | E-mail tespit (Supabase admin listUsers) → token + OTP üretimi → INSERT → mail gönder |
| `acceptInvitationByToken(token, otp, password)` | Token bul, expires_at + attempt_count kontrolü, OTP verify (Argon2) → createUser + proje_uyelikleri INSERT + invitations accept |
| `acceptInvitationById(invitationId, userId)` | Kayıtlı kullanıcı banner accept — proje_uyelikleri INSERT |
| `rejectInvitationById(invitationId, userId)` | Banner reject — status='rejected' |
| `listPendingInvitationsForUser(userId)` | Banner + Projeler badge sorgusu |
| `listInvitationsForProject(projeId, statusFilter?)` | Owner Kullanıcı Yönetimi sayfası |
| `cancelInvitation(invitationId, projeId)` | Owner pending davetı iptal (status='expired') |

### 5.2 Endpoint'ler

```
# Owner/manager (proje izolasyon middleware'i)
POST   /api/projeler/:projeId/invitations
GET    /api/projeler/:projeId/invitations?status=
DELETE /api/projeler/:projeId/invitations/:id

# Authenticated user
GET    /api/me/invitations
POST   /api/me/invitations/:id/accept
POST   /api/me/invitations/:id/reject

# Public (no auth) — IP rate-limit
POST   /api/invitations/accept-by-token   { token, otp, password }
GET    /api/invitations/by-token/:token   → { email, proje_adi, invited_by_name, expires_at }
```

### 5.3 Token & OTP Üretimi

- **Token:** `crypto.randomBytes(32).toString('base64url')` — 43 karakter, 256 bit entropi.
- **OTP:** `crypto.randomInt(100000, 1000000)` — 6 haneli, leading-zero olmasını engelleyen aralık.
- **OTP hash:** Argon2id (`@node-rs/argon2` veya `argon2` paketi); plaintext kod sadece mail gönderimine kadar bellekte tutulur, log'a yazılmaz.

### 5.4 IP Rate-Limit Middleware

`express-rate-limit` paketi:
- `inviteAcceptLimiter` — 60 sn / 5 hit
- `inviteAcceptHourlyLimiter` — 60 dk / 30 hit

Apply: `/api/invitations/accept-by-token` ve `/api/invitations/by-token/:token`.

> **Render trust-proxy:** `app.set('trust proxy', 1)` set edilmeli; X-Forwarded-For doğru okunmazsa rate-limit tüm trafiği tek IP sayar. Mevcut config kontrol edilecek; gerekirse PR'da düzeltilir.

### 5.5 Mail Sağlayıcı

Supabase Auth `inviteUserByEmail` magic-link akışı tamamen kaldırılır (custom OTP içermez). Yeni akış için transactional mail sağlayıcı:

**Önerilen:** Resend (Node SDK, free tier sprint için yeterli).
**Alternatifler:** Postmark, SendGrid, Render üzerinden mevcut SMTP.

Yeni Render env vars:
- `RESEND_API_KEY` (veya seçilen sağlayıcı)
- `MAIL_FROM` — örn. `noreply@koopgenhes.com`
- `APP_PUBLIC_URL` — zaten mevcut

Mail template'leri inline HTML (basit `<table>`); ileride MJML/React-Email'e taşınabilir.

### 5.6 Zod Schema

- `invitationCreateSchema` — `{ email: z.string().email().max(254), projectRole: z.enum(['manager','user']) }`
- `invitationAcceptByTokenSchema` — `{ token: z.string().length(43), otp: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(72) }`

### 5.7 Mevcut Endpoint Refactor

`POST /api/admin/users/invite` (`admin.service.ts:inviteUser`) kaldırılır — `KullaniciYonetimiPage` artık `POST /api/projeler/:projeId/invitations`'ı çağırır. Geriye uyumluluk gereksiz; mevcut açık davet pratikte yok.

### 5.8 Mail İçerik Şablonu

**Yeni kullanıcı (subject:** `koopGenHes — {ProjeAdi} projesi için davet edildiniz`**)**

```
Merhaba,

{InviterName} sizi koopGenHes uygulamasında "{ProjeAdi}" projesine
{Role} rolüyle davet etti.

Daveti tamamlamak için:

1. Aşağıdaki linki tıklayın:
   {APP_PUBLIC_URL}/davet-kabul/{token}

2. Açılan sayfada şu 6 haneli doğrulama kodunu girin:
   {OTP_CODE}

3. Yeni şifrenizi belirleyin.

Davet 7 gün geçerlidir ({ExpiresAt}).

Daveti siz talep etmediyseniz bu maili göz ardı edebilirsiniz.

— koopGenHes
```

**Kayıtlı kullanıcı**

```
Merhaba,

{InviterName} sizi koopGenHes uygulamasında "{ProjeAdi}" projesine
{Role} rolüyle davet etti.

Uygulamaya giriş yaptığınızda davetinizi göreceksiniz; oradan kabul
edebilir veya reddedebilirsiniz.

{APP_PUBLIC_URL}/login

Davet 7 gün geçerlidir ({ExpiresAt}).

— koopGenHes
```

---

## 6. Frontend

### 6.1 Yeni Sayfa: `/davet-kabul/:token` (public)

`client/src/pages/auth/DavetKabulPage.tsx`

- Mount → `GET /api/invitations/by-token/:token` ile davet preview yüklenir (e-mail, proje adı, davet eden, expires_at)
- 404 / expired → error state, login linki
- Form: e-mail (read-only) + 6 haneli kod (AntD `Input.OTP` veya 6 ayrı Input) + yeni şifre + tekrar
- Submit → `POST /api/invitations/accept-by-token` → success ise `supabase.auth.signInWithPassword` + `/` redirect
- Hatalar inline `Alert`: yanlış kod (kalan deneme sayısı), süre doldu, çok hızlı (429)

### 6.2 Banner: `client/src/components/InvitationBanner.tsx`

`AdminLayout` Content üstünde render. `useMyInvitations()` hook ile `GET /api/me/invitations` çağrısı. Pending davet varsa her biri için `Alert` (type=info) — proje adı + rol + expires_at + `[Kabul Et] [Reddet]` butonları.

- `handleAccept` → `POST /api/me/invitations/:id/accept` → toast + `invalidateQueries(['my-invitations','projeler'])` + `ProjectContext.refreshProjects()`
- `handleReject` → `<Popconfirm>` ile onayla → `POST /api/me/invitations/:id/reject` → toast + invalidate

### 6.3 Projeler Listesi — `ProjeListPage.tsx`

Mevcut tabloya değil, ayrı bir section olarak "Bekleyen Davetler" tablosu:

| Proje Adı | Rol | Davet Tarihi | Geçerlilik | Aksiyon |
|---|---|---|---|---|
| Proje A | Manager | 2026-05-21 | 2026-05-28 | [Kabul Et] [Reddet] |

Banner ile aynı `useMyInvitations()` hook'unu kullanır.

### 6.4 Kullanıcı Yönetimi — `KullaniciYonetimiPage.tsx`

Mevcut "Aktif Üyeler" tablosunun yanına 2 yeni Tab:

- **Tab "Bekleyen Davetler":** `GET /api/projeler/:projeId/invitations?status=pending`. Kolonlar: E-mail | Rol | Davet Eden | Tarih | Geçerlilik | Aksiyon (Cancel). Cancel → `DELETE /api/projeler/:projeId/invitations/:id` (status='expired').
- **Tab "Geçmiş":** `?status=rejected,expired,accepted`. "Tekrar Davet Et" butonu reject/expired satırlarda.

"Üye Davet Et" modal'ı korunur; endpoint değişir (`POST /api/projeler/:projeId/invitations`). 409 conflict → "Bu e-mail için bekleyen davet var" alert.

### 6.5 Hook: `useMyInvitations()`

`client/src/hooks/useMyInvitations.ts` — react-query. `staleTime: 60_000`. Banner + Projeler badge + ProjeListPage section bu hook'u kullanır.

### 6.6 Router Değişiklikleri (`App.tsx`)

```diff
+ <Route path="/davet-kabul/:token" element={<DavetKabulPage />} />
- <Route path="/sifre-belirle" element={<SifreBelirlePage />} />
```

`SifreBelirlePage` dosyası silinir (davet artık `/davet-kabul/:token`'a gidiyor; şifre kurtarma `/auth/sifre-sifirla`'da kalır).

### 6.7 TypeScript Tipleri

`client/src/types/invitation.ts` — `InvitationStatus`, `InvitedRole`, `MyInvitation`, `ProjectInvitation`, `InvitationByToken`.

### 6.8 Türkçe Mesajlar (i18n yok)

- Success: "Davet kabul edildi. {ProjeAdi} projesine erişiminiz açıldı."
- Reject: "Daveti reddettiniz."
- Yanlış kod: "Kod yanlış. {N} deneme hakkınız kaldı."
- Lockout/expired: "Davetin süresi doldu veya çok fazla hatalı deneme yapıldı. Lütfen yöneticiyle iletişime geçin."
- Rate-limit (429): "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin."
- Owner duplicate (409): "Bu e-mail için bekleyen davet var. Önce iptal etmeniz gerekiyor."

---

## 7. Test Stratejisi

### 7.1 Server Unit (`invitation.service.test.ts`)

- OTP hash + verify (Argon2 doğru kullanımı, plaintext sızmıyor)
- Token üretimi 32 byte base64url uniqueness
- `acceptInvitationByToken`: yanlış kod → attempt_count++, 5'inci yanlışta expired
- `acceptInvitationByToken`: expired → reddedilir
- Aynı token ile ikinci POST → 400 (idempotency)
- `createInvitation`: zaten pending varsa 409
- `rejectInvitationById`: sadece kendi davetini reddedebilir

### 7.2 Server Integration (`invitations.smoke.test.ts`)

- Owner davet eder → invitations row + audit_logs INSERT
- Yeni user accept flow: token+OTP+password → auth.users + proje_uyelikleri + invitations status='accepted'
- Kayıtlı user accept flow: banner endpoint → proje_uyelikleri INSERT
- Reject flow: proje_uyelikleri INSERT olmaz, status='rejected'
- Pending user RLS: `is_project_member` false → projeye erişemez
- Rate-limit: 6'ıncı hit 429

### 7.3 Client E2E (`invitation-flow.spec.ts`)

- Public route: `/davet-kabul/invalid-token` → error state
- Banner render (mock pending)
- Projeler listesi pending section + aksiyonlar
- Owner Bekleyen Davetler sekmesi: davet ekle → satır + Cancel akışı

> Authenticated E2E flow'ları issue #78 (test infra fix) sonrası yeşilleşir. Bu sprintte minimal smoke yeterli.

### 7.4 Manuel Post-Deploy Smoke (Issue olarak takip)

- Yeni e-mail davet → mail geldi mi, link açılıyor mu
- Yanlış kod 5 kez → "süresi doldu" mesajı
- Doğru flow → otomatik login
- Kayıtlı kullanıcı davet → bilgi mail + banner
- Banner Kabul → erişim açılır, RLS doğru
- Banner Reddet → tekrar görünmez
- Owner Bekleyen sekmesi + Cancel akışı

---

## 8. Güvenlik Kontrol Listesi

- ✅ OTP plaintext sızıntısı yok (Argon2 hash, log temiz, response temiz)
- ✅ Token entropy 256 bit (tahmin edilemez)
- ✅ Timing-safe compare (Argon2 verify constant-time)
- ✅ E-mail enumeration yok (davet oluşturma owner-only; accept-by-token token bilmiyorsa 404)
- ✅ Render trust-proxy doğru (rate-limit X-Forwarded-For'u okur)
- ✅ Token reuse engellendi (accept sonrası status='accepted', ikinci POST 400)
- ✅ Audit log (incident response)
- ✅ RLS: `user_id = auth.uid()` ile kullanıcı sadece kendi davetini görür

---

## 9. Deploy Adımları

1. Migration `20260522000001_invitations_table.sql` Supabase push
2. Migration `20260522000002_fn_audit_invitations.sql` Supabase push
3. Render env vars: `RESEND_API_KEY` (veya seçilen sağlayıcı), `MAIL_FROM` (`APP_PUBLIC_URL` mevcut)
4. Backend deploy
5. Frontend deploy (Vercel)
6. Manuel post-deploy smoke (issue takipli)
7. Mevcut `POST /api/admin/users/invite` route'u kaldır

---

## 10. Geriye Dönük Etki

- **`SifreBelirlePage` silinir** (App.tsx route'u dahil). Mevcut açık davet pratikte yok; varsa owner manuel re-invite eder.
- **`auth.admin.inviteUserByEmail` çağrısı kaldırılır.** Supabase tarafında "Auto Confirm" gerektirmez (yeni akışta `createUser({ email_confirm: true })`).
- **`proje_uyelikleri` dokunulmaz.** Mevcut RLS değişmez.

---

## 11. Out of Scope

- SMS OTP (telefon zorunlu değil)
- 2FA login (signup sonrası)
- E-mail değişikliği akışı
- Davet reminder mail (cron)
- Owner için pending davet özet widget'i
- Bulk invite (CSV upload)
- Davet linki QR kodu

---

## 12. Açık Sorular

- **Mail sağlayıcı seçimi:** Resend mi (önerilen) yoksa Render üzerinden mevcut SMTP mi? Implementation aşamasında karar verilir, spec'i etkilemez.
- **Render trust-proxy ayarı:** Mevcut config'te `app.set('trust proxy', 1)` var mı? Implementation aşamasında doğrulanır, gerekirse aynı PR'da eklenir.
- **`@node-rs/argon2` vs. `argon2`:** Hangisi projede daha az bağımlılık getirir? Implementation aşamasında değerlendirilir.

Bu üç açık soru tasarımın değerini etkilemez; implementation planı yazılırken netleştirilir.
