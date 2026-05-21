# Davet Akışı Yeniden Tasarımı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OTP doğrulamalı yeni-kullanıcı davet akışı + kayıtlı kullanıcı için in-app kabul/red bildirimi — `auth.admin.inviteUserByEmail` magic-link yerine yeni `invitations` tablosu üzerinden.

**Architecture:** Yeni `invitations` tablosu pending davetleri tutar (Argon2-hashed OTP + token + 7gün TTL). `proje_uyelikleri` dokunulmaz, sadece kabul edilen davetler INSERT eder; mevcut RLS otomatik olarak engelliyor pending erişimi. Backend transactional mail için Resend kullanır; brute-force attempt-lockout + IP rate-limit + audit log ile korunur. Frontend public `/davet-kabul/:token` sayfası (yeni kullanıcı için OTP/şifre formu) + AdminLayout banner + Projeler listesi badge + Kullanıcı Yönetimi'nde 3 sekme.

**Tech Stack:** TypeScript, Express 5, Supabase (Postgres + Auth), React 18, Ant Design 6, react-query, Playwright, Vitest. Yeni paketler: `argon2`, `resend`, `express-rate-limit`.

**Spec:** `docs/superpowers/specs/2026-05-21-invitation-flow-design.md`

---

## File Structure

### Database (Phase 1 / PR-A)

- Create: `supabase/migrations/20260522000001_invitations_table.sql`
- Create: `supabase/migrations/20260522000002_fn_audit_invitations.sql`

### Backend (Phase 1 / PR-A)

- Create: `server/src/services/invitation.service.ts` — tüm davet logic'i (create/accept-by-token/accept-by-id/reject/list/cancel)
- Create: `server/src/services/mailer.service.ts` — Resend wrapper + 2 template
- Create: `server/src/schemas/invitation.schema.ts` — Zod
- Create: `server/src/controllers/invitations.controller.ts` — owner endpoint'leri (create/list/cancel)
- Create: `server/src/controllers/meInvitations.controller.ts` — authenticated user (list/accept/reject)
- Create: `server/src/controllers/publicInvitations.controller.ts` — public token endpoint'leri
- Create: `server/src/routes/invitations.routes.ts`
- Create: `server/src/routes/meInvitations.routes.ts`
- Create: `server/src/routes/publicInvitations.routes.ts`
- Create: `server/src/middleware/invitationRateLimit.ts` — express-rate-limit instance'ları
- Modify: `server/src/routes/index.ts` — 3 yeni route mount + `/api/admin/users/invite` kaldır
- Modify: `server/src/index.ts` — `app.set('trust proxy', 1)` ekle
- Modify: `server/src/services/admin.service.ts` — `inviteUser()` kaldır
- Modify: `server/src/controllers/admin.controller.ts` — `inviteUser` handler kaldır
- Modify: `server/src/routes/admin.routes.ts` — invite route satırı kaldır
- Modify: `server/package.json` — `argon2`, `resend`, `express-rate-limit` ekle
- Modify: `.env.example` — `RESEND_API_KEY`, `MAIL_FROM` ekle

### Backend Tests (Phase 1 / PR-A)

- Create: `server/tests/unit/invitation.service.test.ts`
- Create: `server/tests/integration/invitations.smoke.test.ts`

### Frontend Public (Phase 2 / PR-B)

- Create: `client/src/types/invitation.ts` — TS tipleri
- Create: `client/src/lib/invitationsApi.ts` — axios wrapper'lar
- Create: `client/src/hooks/useMyInvitations.ts` — react-query
- Create: `client/src/pages/auth/DavetKabulPage.tsx` — public route
- Create: `client/src/components/InvitationBanner.tsx` — dashboard banner
- Modify: `client/src/components/AdminLayout.tsx` — Banner mount (Content üstü)
- Modify: `client/src/App.tsx` — `/davet-kabul/:token` route ekle, `/sifre-belirle` route kaldır
- Delete: `client/src/pages/SifreBelirlePage.tsx`

### Frontend Owner UI (Phase 3 / PR-C)

- Modify: `client/src/pages/projeler/ProjeListPage.tsx` — Bekleyen Davetler section
- Modify: `client/src/pages/admin/KullaniciYonetimiPage.tsx` — endpoint değişimi + 3 sekme (Aktif / Bekleyen / Geçmiş)
- Create: `client/e2e/invitation-flow.spec.ts` — E2E smoke

### Deploy (Phase 3 / PR-C son adımı)

- Supabase: migration push
- Render env: `RESEND_API_KEY`, `MAIL_FROM`
- Vercel: otomatik (PR merge sonrası)
- Manuel post-deploy smoke (issue takibi)

---

## PHASE 1 — Backend (PR-A)

### Task 1: Yeni Paketleri Ekle

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: argon2 + resend + express-rate-limit yükle**

```bash
cd server
npm install argon2 resend express-rate-limit
npm install --save-dev @types/express-rate-limit
```

- [ ] **Step 2: Yükleme doğrulama**

Run: `npm ls argon2 resend express-rate-limit`
Expected: Üç paket listelenir, version conflict yok.

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore(server): add argon2 + resend + express-rate-limit"
```

---

### Task 2: .env.example Güncelle

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Mail env vars ekle**

`.env.example` dosyasının altına ekle:

```
# Transactional mail (Resend)
RESEND_API_KEY=
MAIL_FROM=noreply@koopgenhes.com
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): document RESEND_API_KEY + MAIL_FROM"
```

---

### Task 3: Trust Proxy Ayarı

**Files:**
- Modify: `server/src/index.ts` (line ~12-15)

- [ ] **Step 1: app.set('trust proxy', 1) ekle**

`server/src/index.ts` içinde `const app = express()` satırından hemen sonra:

```typescript
const app = express()
const port = process.env.PORT || 3001

// Render gibi reverse-proxy arkasında çalışıyoruz; X-Forwarded-For
// header'ı doğru okunsun ki express-rate-limit gerçek client IP'sini sayabilsin.
app.set('trust proxy', 1)

app.use(helmet())
```

- [ ] **Step 2: Build kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "fix(server): trust proxy=1 for rate-limit X-Forwarded-For"
```

---

### Task 4: invitations Tablosu Migration

**Files:**
- Create: `supabase/migrations/20260522000001_invitations_table.sql`

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Davet akışı yeniden tasarımı (spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md)
-- Yeni invitations tablosu pending davetleri tutar; proje_uyelikleri dokunulmaz.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id      UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  email         CITEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_role  VARCHAR(16) NOT NULL CHECK (invited_role IN ('manager','user')),
  invited_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- "Yeni kullanıcı" akışı için; kayıtlı kullanıcıda NULL
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

-- updated_at otomatik dolsun (mevcut trg_set_updated_at pattern'i)
CREATE TRIGGER trg_invitations_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Aynı (proje, email) için aktif birden fazla pending davet engellensin
CREATE UNIQUE INDEX uniq_invite_active
  ON public.invitations (proje_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_invite_user_pending
  ON public.invitations (user_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_invite_proje_status
  ON public.invitations (proje_id, status);

CREATE INDEX idx_invite_token
  ON public.invitations (token)
  WHERE token IS NOT NULL;

-- RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Owner/manager kendi projesinin davetlerini görür
-- is_project_manager(p_proje_id) helper'ı owner VEYA manager için TRUE döner
-- (supabase/migrations/20260520000010_role_v2_expand.sql)
CREATE POLICY invitations_read_owner_manager
  ON public.invitations FOR SELECT
  USING (public.is_project_manager(proje_id));

-- Kullanıcı kendi user_id'sine ait davetleri görür (banner)
CREATE POLICY invitations_read_self
  ON public.invitations FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE service-role üzerinden (anon yok)
-- Public accept-by-token endpoint backend service-role kullanır
```

Eğer `fn_set_updated_at` projedeki standart trigger değilse, `20260520000010_role_v2_expand.sql` veya başka bir migration'da nasıl adlandığını kontrol et — eğer farklı isim (örn. `trg_set_updated_at_fn`) ise migration içinde uygun adı kullan.

- [ ] **Step 2: fn_set_updated_at fonksiyon adını doğrula**

```bash
grep -rn "fn_set_updated_at\|set_updated_at" supabase/migrations/ | head -5
```

Bulduğun gerçek isimle Step 1'deki migration'ı güncelle (gerekiyorsa). Eğer böyle bir trigger fonksiyonu yoksa, migration başına ekle:

```sql
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Migration'ı lokalde test et**

Supabase lokal CLI ile (`supabase start` çalışıyor olmalı):

```bash
supabase db reset --local
# veya sadece yeni migration:
supabase db push --local
```

Expected: Hatasız tamamlanır. `\d invitations` ile schema doğrulanır.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000001_invitations_table.sql
git commit -m "feat(db): invitations table + RLS"
```

---

### Task 5: Audit Trigger Migration

**Files:**
- Create: `supabase/migrations/20260522000002_fn_audit_invitations.sql`

- [ ] **Step 1: Mevcut audit pattern'ı incele**

```bash
grep -l "fn_audit_" supabase/migrations/ | head -3
cat supabase/migrations/20260519000001_audit_proje_uyelikleri.sql
```

- [ ] **Step 2: Migration dosyasını yaz**

Mevcut `fn_audit_proje_uyelikleri` pattern'ini takip et — fonksiyon adı `fn_audit_invitations`, trigger adı `trg_audit_invitations`:

```sql
-- Audit trigger for invitations (mevcut fn_audit_proje_uyelikleri pattern'i)
CREATE OR REPLACE FUNCTION public.fn_audit_invitations()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    table_name, operation, row_id, actor_id, actor_email,
    old_data, new_data, changed_at
  )
  VALUES (
    'invitations',
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    COALESCE(current_setting('app.actor_id', true)::UUID, NULL),
    COALESCE(current_setting('app.actor_email', true), NULL),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_invitations
  AFTER INSERT OR UPDATE OR DELETE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_invitations();
```

Eğer mevcut `audit_logs` schema farklı sütunlara sahipse (örn. `actor_email` yoksa), `fn_audit_proje_uyelikleri` ile birebir hizala.

- [ ] **Step 3: Lokalde test et**

```bash
supabase db push --local
```

Expected: Hatasız. Sonra:

```sql
-- Doğrulama (Supabase SQL Editor):
INSERT INTO public.invitations
  (proje_id, email, invited_role, invited_by, expires_at)
VALUES
  ('<bir-proje-id>', 'test@example.com', 'user', '<bir-user-id>', now() + interval '7 days');

SELECT * FROM public.audit_logs WHERE table_name='invitations' ORDER BY changed_at DESC LIMIT 1;
-- → INSERT event olmalı
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000002_fn_audit_invitations.sql
git commit -m "feat(db): audit trigger for invitations"
```

---

### Task 6: Zod Schema

**Files:**
- Create: `server/src/schemas/invitation.schema.ts`

- [ ] **Step 1: Schema dosyasını yaz**

```typescript
import { z } from 'zod'

export const invitationCreateSchema = z.object({
  email: z.string().email().max(254),
  projectRole: z.enum(['manager', 'user']),
})
export type InvitationCreateBody = z.infer<typeof invitationCreateSchema>

export const invitationAcceptByTokenSchema = z.object({
  token: z.string().min(20).max(64), // base64url 32 byte = 43 char; tolerance bırak
  otp: z.string().regex(/^\d{6}$/, '6 haneli olmalı'),
  password: z.string().min(8).max(72), // Supabase Auth limit
})
export type InvitationAcceptByTokenBody = z.infer<typeof invitationAcceptByTokenSchema>

export const invitationListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .refine(
      (arr) =>
        !arr ||
        arr.every((v) => ['pending', 'accepted', 'rejected', 'expired'].includes(v)),
      { message: 'status: pending,accepted,rejected,expired' },
    ),
})
export type InvitationListQuery = z.infer<typeof invitationListQuerySchema>
```

- [ ] **Step 2: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add server/src/schemas/invitation.schema.ts
git commit -m "feat(server): invitation Zod schemas"
```

---

### Task 7: Mailer Service

**Files:**
- Create: `server/src/services/mailer.service.ts`

- [ ] **Step 1: Mailer wrapper yaz**

```typescript
import { Resend } from 'resend'
import logger from '../utils/logger'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM ?? 'noreply@koopgenhes.com'

let resend: Resend | null = null
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY)
} else {
  logger.warn('[MAILER] RESEND_API_KEY tanımlı değil; mail gönderimleri stub mode')
}

export interface NewUserInviteMailData {
  to: string
  projeAdi: string
  inviterName: string
  role: 'manager' | 'user'
  acceptUrl: string
  otpCode: string
  expiresAt: Date
}

export interface ExistingUserInviteMailData {
  to: string
  projeAdi: string
  inviterName: string
  role: 'manager' | 'user'
  loginUrl: string
  expiresAt: Date
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export const mailer = {
  async sendNewUserInvite(data: NewUserInviteMailData): Promise<void> {
    const subject = `koopGenHes — ${data.projeAdi} projesi için davet edildiniz`
    const text = `Merhaba,

${data.inviterName} sizi koopGenHes uygulamasında "${data.projeAdi}" projesine ${data.role} rolüyle davet etti.

Daveti tamamlamak için:

1. Aşağıdaki linki tıklayın:
   ${data.acceptUrl}

2. Açılan sayfada şu 6 haneli doğrulama kodunu girin:
   ${data.otpCode}

3. Yeni şifrenizi belirleyin.

Davet ${formatDate(data.expiresAt)} tarihine kadar geçerlidir.

Daveti siz talep etmediyseniz bu maili göz ardı edebilirsiniz.

— koopGenHes`

    if (!resend) {
      logger.info(`[MAILER STUB] new-user invite → ${data.to}; otp=${data.otpCode}; url=${data.acceptUrl}`)
      return
    }
    const { error } = await resend.emails.send({
      from: MAIL_FROM,
      to: data.to,
      subject,
      text,
    })
    if (error) {
      logger.error('[MAILER] new-user invite send failed', { err: error, to: data.to })
      throw new Error('Mail gönderilemedi')
    }
  },

  async sendExistingUserInvite(data: ExistingUserInviteMailData): Promise<void> {
    const subject = `koopGenHes — ${data.projeAdi} projesi için davet edildiniz`
    const text = `Merhaba,

${data.inviterName} sizi koopGenHes uygulamasında "${data.projeAdi}" projesine ${data.role} rolüyle davet etti.

Uygulamaya giriş yaptığınızda davetinizi göreceksiniz; oradan kabul edebilir veya reddedebilirsiniz.

${data.loginUrl}

Davet ${formatDate(data.expiresAt)} tarihine kadar geçerlidir.

— koopGenHes`

    if (!resend) {
      logger.info(`[MAILER STUB] existing-user invite → ${data.to}; url=${data.loginUrl}`)
      return
    }
    const { error } = await resend.emails.send({
      from: MAIL_FROM,
      to: data.to,
      subject,
      text,
    })
    if (error) {
      logger.error('[MAILER] existing-user invite send failed', { err: error, to: data.to })
      throw new Error('Mail gönderilemedi')
    }
  },
}
```

> **Stub mode notu:** `RESEND_API_KEY` boşsa mail logger'a yazılır, gerçek gönderim atlanır. Lokal geliştirme için yeterli.

- [ ] **Step 2: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/mailer.service.ts
git commit -m "feat(server): Resend mailer service (stub-fallback)"
```

---

### Task 8: Rate-Limit Middleware

**Files:**
- Create: `server/src/middleware/invitationRateLimit.ts`

- [ ] **Step 1: Middleware yaz**

```typescript
import rateLimit from 'express-rate-limit'

const acceptMessage = {
  error: 'Çok fazla istek. Lütfen birkaç dakika sonra tekrar deneyin.',
}

export const inviteAcceptMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: acceptMessage,
})

export const inviteAcceptHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: acceptMessage,
})
```

- [ ] **Step 2: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/invitationRateLimit.ts
git commit -m "feat(server): IP rate-limit middleware (5/min, 30/hour)"
```

---

### Task 9: Invitation Service — Unit Test Önce

**Files:**
- Create: `server/tests/unit/invitation.service.test.ts`

- [ ] **Step 1: Test dosyasını yaz (TDD: önce başarısız test)**

`server/tests/unit/invitation.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { hashOtp, verifyOtp, generateInviteToken, generateOtpCode } from '../../src/services/invitation.helpers'

describe('invitation.helpers', () => {
  describe('generateOtpCode', () => {
    it('6 haneli rakamdan oluşan kod döner', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateOtpCode()
        expect(code).toMatch(/^\d{6}$/)
      }
    })
  })

  describe('generateInviteToken', () => {
    it('base64url formatında, en az 40 karakter token döner', () => {
      const t = generateInviteToken()
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(t.length).toBeGreaterThanOrEqual(40)
    })

    it('iki token aynı olmaz (entropy)', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        tokens.add(generateInviteToken())
      }
      expect(tokens.size).toBe(1000)
    })
  })

  describe('hashOtp / verifyOtp', () => {
    it('hash farklıdır plaintext kodlardan', async () => {
      const code = '123456'
      const hash = await hashOtp(code)
      expect(hash).not.toContain(code)
      expect(hash.length).toBeGreaterThan(20)
    })

    it('doğru kod verify TRUE döner', async () => {
      const code = '654321'
      const hash = await hashOtp(code)
      expect(await verifyOtp(hash, code)).toBe(true)
    })

    it('yanlış kod verify FALSE döner', async () => {
      const hash = await hashOtp('111111')
      expect(await verifyOtp(hash, '222222')).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız olmalı**

Run: `cd server && npx vitest run tests/unit/invitation.service.test.ts`
Expected: FAIL with module not found `../../src/services/invitation.helpers`.

- [ ] **Step 3: Helper dosyasını yaz**

`server/src/services/invitation.helpers.ts` (yeni dosya):

```typescript
import { randomBytes, randomInt } from 'crypto'
import argon2 from 'argon2'

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function generateOtpCode(): string {
  // 6 haneli, leading-zero olmayacak şekilde (100000–999999)
  return randomInt(100000, 1_000_000).toString()
}

export async function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, {
    type: argon2.argon2id,
    memoryCost: 19_456, // ~19MB
    timeCost: 2,
    parallelism: 1,
  })
}

export async function verifyOtp(hash: string, otp: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, otp)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Test PASS doğrulama**

Run: `cd server && npx vitest run tests/unit/invitation.service.test.ts`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/invitation.helpers.ts server/tests/unit/invitation.service.test.ts
git commit -m "feat(server): invitation helpers (token/OTP/hash) + unit tests"
```

---

### Task 10: Invitation Service — Ana Logic

**Files:**
- Create: `server/src/services/invitation.service.ts`

- [ ] **Step 1: Servis dosyasını yaz**

```typescript
import { supabaseAdmin } from '../lib/supabase'
import { ApiError } from '../utils/errors'
import logger from '../utils/logger'
import { mailer } from './mailer.service'
import { clearProjectAccessCache } from '../middleware/projectAccessCache'
import {
  generateInviteToken,
  generateOtpCode,
  hashOtp,
  verifyOtp,
} from './invitation.helpers'

const TTL_DAYS = 7
const MAX_ATTEMPTS = 5
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '')

interface CreateInvitationInput {
  projeId: string
  email: string
  invitedRole: 'manager' | 'user'
  invitedBy: string // user_id
  invitedByName: string
}

interface InvitationRow {
  id: string
  proje_id: string
  email: string
  user_id: string | null
  invited_role: 'manager' | 'user'
  invited_by: string | null
  token: string | null
  otp_hash: string | null
  attempt_count: number
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  expires_at: string
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
  updated_at: string
}

async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  // Supabase admin listUsers pagination — örnek pattern (mevcut admin.service.ts ile aynı)
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    logger.error('[INVITATION] listUsers failed', { err: error })
    throw ApiError.internal('Kullanıcı aramada hata')
  }
  const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return found ? { id: found.id, email: found.email ?? email } : null
}

async function findProjeAdi(projeId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('projeler')
    .select('proje_adi')
    .eq('id', projeId)
    .single()
  if (error || !data) {
    throw ApiError.notFound('Proje bulunamadı')
  }
  return (data as { proje_adi: string }).proje_adi
}

export const invitationService = {
  async createInvitation(input: CreateInvitationInput) {
    const projeAdi = await findProjeAdi(input.projeId)

    // Zaten pending var mı?
    const { data: existing } = await supabaseAdmin
      .from('invitations')
      .select('id')
      .eq('proje_id', input.projeId)
      .eq('email', input.email)
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) {
      throw ApiError.conflict('Bu e-mail için bekleyen davet var')
    }

    const existingUser = await findUserByEmail(input.email)
    const isNewUser = !existingUser

    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)

    let token: string | null = null
    let otpHash: string | null = null
    let otpPlain: string | null = null

    if (isNewUser) {
      token = generateInviteToken()
      otpPlain = generateOtpCode()
      otpHash = await hashOtp(otpPlain)
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('invitations')
      .insert({
        proje_id: input.projeId,
        email: input.email,
        user_id: existingUser?.id ?? null,
        invited_role: input.invitedRole,
        invited_by: input.invitedBy,
        token,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single<InvitationRow>()
    if (insErr || !inserted) {
      logger.error('[INVITATION] insert failed', { err: insErr })
      throw ApiError.internal('Davet oluşturulamadı')
    }

    // Mail gönder (plaintext OTP burada kullanılır, sonra GC'ye gider)
    try {
      if (isNewUser) {
        if (!token || !otpPlain) {
          throw new Error('token/otp generation race')
        }
        await mailer.sendNewUserInvite({
          to: input.email,
          projeAdi,
          inviterName: input.invitedByName,
          role: input.invitedRole,
          acceptUrl: `${APP_PUBLIC_URL}/davet-kabul/${token}`,
          otpCode: otpPlain,
          expiresAt,
        })
      } else {
        await mailer.sendExistingUserInvite({
          to: input.email,
          projeAdi,
          inviterName: input.invitedByName,
          role: input.invitedRole,
          loginUrl: `${APP_PUBLIC_URL}/login`,
          expiresAt,
        })
      }
    } catch (mailErr) {
      // Mail başarısız ise davet row'u silmeyiz; owner Kullanıcı Yönetimi sayfasında
      // görebilir ve "Tekrar Davet Et" ile yeniden tetikleyebilir. Audit'te kalır.
      logger.error('[INVITATION] mail send failed (invitation kept)', { err: mailErr })
    }

    logger.info(
      `[INVITATION] created id=${inserted.id} proje=${input.projeId} email=${input.email} isNew=${isNewUser}`,
    )

    return {
      id: inserted.id,
      projeId: inserted.proje_id,
      email: inserted.email,
      isNewUser,
      expiresAt: inserted.expires_at,
    }
  },

  async acceptInvitationByToken(token: string, otp: string, password: string) {
    const { data: inv, error: selErr } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle<InvitationRow>()
    if (selErr) {
      logger.error('[INVITATION] accept-by-token select error', { err: selErr })
      throw ApiError.internal('Davet aranırken hata')
    }
    if (!inv) {
      throw ApiError.badRequest('Davet bulunamadı')
    }
    if (inv.status !== 'pending') {
      throw ApiError.badRequest('Davet artık geçerli değil')
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', inv.id)
      throw ApiError.badRequest('Davetin süresi dolmuş')
    }
    if (inv.attempt_count >= MAX_ATTEMPTS) {
      throw ApiError.badRequest('Çok fazla yanlış deneme; yeni davet gerekir')
    }
    if (!inv.otp_hash) {
      throw ApiError.badRequest('Davet OTP içermiyor (kayıtlı kullanıcı akışı)')
    }

    const otpOk = await verifyOtp(inv.otp_hash, otp)
    if (!otpOk) {
      const newCount = inv.attempt_count + 1
      const newStatus = newCount >= MAX_ATTEMPTS ? 'expired' : 'pending'
      await supabaseAdmin
        .from('invitations')
        .update({ attempt_count: newCount, status: newStatus })
        .eq('id', inv.id)
      const remaining = Math.max(0, MAX_ATTEMPTS - newCount)
      if (newStatus === 'expired') {
        throw ApiError.badRequest('Çok fazla yanlış deneme; yeni davet gerekir')
      }
      throw ApiError.badRequest(`Kod yanlış. ${remaining} deneme hakkınız kaldı`)
    }

    // OTP doğru → kullanıcı yarat ve üyelik aç
    const { data: created, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
    })
    if (cuErr || !created?.user) {
      logger.error('[INVITATION] createUser failed', { err: cuErr, email: inv.email })
      throw ApiError.internal('Kullanıcı oluşturulamadı')
    }
    const userId = created.user.id

    const { error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert(
        { user_id: userId, proje_id: inv.proje_id, rol: inv.invited_role },
        { onConflict: 'user_id,proje_id' },
      )
    if (memErr) {
      logger.error('[INVITATION] proje_uyelikleri upsert failed', { err: memErr, userId })
      // Cleanup: yeni yaratılan kullanıcıyı sil (idempotent değilse manual review)
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined)
      throw ApiError.internal('Üyelik açılamadı')
    }
    clearProjectAccessCache(userId, inv.proje_id)

    await supabaseAdmin
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq('id', inv.id)

    logger.info(`[INVITATION] accepted by-token id=${inv.id} user=${userId}`)

    return {
      email: inv.email,
      projeId: inv.proje_id,
    }
  },

  async acceptInvitationById(invitationId: string, userId: string) {
    const { data: inv, error: selErr } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle<InvitationRow>()
    if (selErr) throw ApiError.internal('Davet aranırken hata')
    if (!inv) throw ApiError.notFound('Davet bulunamadı veya artık geçerli değil')

    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from('invitations').update({ status: 'expired' }).eq('id', inv.id)
      throw ApiError.badRequest('Davetin süresi dolmuş')
    }

    const { error: memErr } = await supabaseAdmin
      .from('proje_uyelikleri')
      .upsert(
        { user_id: userId, proje_id: inv.proje_id, rol: inv.invited_role },
        { onConflict: 'user_id,proje_id' },
      )
    if (memErr) {
      logger.error('[INVITATION] accept-by-id membership failed', { err: memErr })
      throw ApiError.internal('Üyelik açılamadı')
    }
    clearProjectAccessCache(userId, inv.proje_id)

    await supabaseAdmin
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', inv.id)

    return { projeId: inv.proje_id, role: inv.invited_role }
  },

  async rejectInvitationById(invitationId: string, userId: string) {
    const { error } = await supabaseAdmin
      .from('invitations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (error) {
      logger.error('[INVITATION] reject failed', { err: error })
      throw ApiError.internal('Reddedilemedi')
    }
    return { ok: true }
  },

  async listPendingForUser(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        `id, proje_id, invited_role, expires_at, created_at,
         proje:projeler ( proje_adi ),
         inviter:invited_by ( email )`,
      )
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) {
      logger.error('[INVITATION] list-for-user failed', { err: error })
      throw ApiError.internal('Davetler alınamadı')
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      proje_id: r.proje_id,
      proje_adi: r.proje?.proje_adi ?? '',
      invited_role: r.invited_role,
      invited_by_email: r.inviter?.email ?? null,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }))
  },

  async listForProject(projeId: string, statusFilter?: string[]) {
    let q = supabaseAdmin
      .from('invitations')
      .select('id, email, user_id, invited_role, invited_by, status, expires_at, attempt_count, created_at, accepted_at, rejected_at')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: false })
    if (statusFilter && statusFilter.length > 0) {
      q = q.in('status', statusFilter)
    } else {
      q = q.eq('status', 'pending')
    }
    const { data, error } = await q
    if (error) {
      logger.error('[INVITATION] list-for-project failed', { err: error })
      throw ApiError.internal('Davetler alınamadı')
    }
    return data ?? []
  },

  async cancelInvitation(invitationId: string, projeId: string) {
    const { error } = await supabaseAdmin
      .from('invitations')
      .update({ status: 'expired' })
      .eq('id', invitationId)
      .eq('proje_id', projeId)
      .eq('status', 'pending')
    if (error) {
      logger.error('[INVITATION] cancel failed', { err: error })
      throw ApiError.internal('İptal edilemedi')
    }
    return { ok: true }
  },

  async getPreviewByToken(token: string) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        `email, expires_at, status, attempt_count,
         proje:projeler ( proje_adi ),
         inviter:invited_by ( email )`,
      )
      .eq('token', token)
      .maybeSingle()
    if (error) throw ApiError.internal('Önizleme alınamadı')
    if (!data) throw ApiError.notFound('Davet bulunamadı')
    const expired =
      data.status !== 'pending' ||
      new Date((data as any).expires_at).getTime() < Date.now() ||
      ((data as any).attempt_count ?? 0) >= MAX_ATTEMPTS
    return {
      email: (data as any).email,
      proje_adi: (data as any).proje?.proje_adi ?? '',
      invited_by_email: (data as any).inviter?.email ?? null,
      expires_at: (data as any).expires_at,
      expired,
    }
  },
}
```

> **NOT (Açık Soru):** `supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })` — production'da kullanıcı sayısı 1000'i aşarsa `findUserByEmail` doğru çalışmaz. Mevcut `admin.service.ts` aynı pattern'i kullanıyor; ileride `auth.admin.getUserByEmail` (Supabase ekledi) veya pagination loop gerekebilir. Bu sprint scope'unda kalmaz.

- [ ] **Step 2: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/invitation.service.ts
git commit -m "feat(server): invitation service (create/accept/reject/list/cancel)"
```

---

### Task 11: Controllers

**Files:**
- Create: `server/src/controllers/invitations.controller.ts` (owner endpoint'leri)
- Create: `server/src/controllers/meInvitations.controller.ts`
- Create: `server/src/controllers/publicInvitations.controller.ts`

- [ ] **Step 1: invitations.controller.ts (owner)**

```typescript
import { Request, Response, NextFunction } from 'express'
import { invitationService } from '../services/invitation.service'
import { invitationCreateSchema, invitationListQuerySchema } from '../schemas/invitation.schema'
import { ApiError } from '../utils/errors'

export const invitationsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { projeId } = req.params
      const body = invitationCreateSchema.parse(req.body)
      const invitedBy = req.user?.id
      const invitedByName = req.user?.email ?? 'koopGenHes'
      if (!invitedBy) throw ApiError.unauthorized('Kimlik doğrulanamadı')

      const result = await invitationService.createInvitation({
        projeId,
        email: body.email,
        invitedRole: body.projectRole,
        invitedBy,
        invitedByName,
      })
      res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { projeId } = req.params
      const q = invitationListQuerySchema.parse(req.query)
      const result = await invitationService.listForProject(projeId, q.status)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const { projeId, id } = req.params
      await invitationService.cancelInvitation(id, projeId)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
}
```

- [ ] **Step 2: meInvitations.controller.ts**

```typescript
import { Request, Response, NextFunction } from 'express'
import { invitationService } from '../services/invitation.service'
import { ApiError } from '../utils/errors'

export const meInvitationsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id
      if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
      const result = await invitationService.listPendingForUser(userId)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id
      if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
      const result = await invitationService.acceptInvitationById(req.params.id, userId)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id
      if (!userId) throw ApiError.unauthorized('Kimlik doğrulanamadı')
      const result = await invitationService.rejectInvitationById(req.params.id, userId)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
}
```

- [ ] **Step 3: publicInvitations.controller.ts**

```typescript
import { Request, Response, NextFunction } from 'express'
import { invitationService } from '../services/invitation.service'
import { invitationAcceptByTokenSchema } from '../schemas/invitation.schema'

export const publicInvitationsController = {
  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params
      const result = await invitationService.getPreviewByToken(token)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      const body = invitationAcceptByTokenSchema.parse(req.body)
      const result = await invitationService.acceptInvitationByToken(body.token, body.otp, body.password)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
}
```

- [ ] **Step 4: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/invitations.controller.ts server/src/controllers/meInvitations.controller.ts server/src/controllers/publicInvitations.controller.ts
git commit -m "feat(server): invitation controllers (owner/me/public)"
```

---

### Task 12: Routes

**Files:**
- Create: `server/src/routes/invitations.routes.ts`
- Create: `server/src/routes/meInvitations.routes.ts`
- Create: `server/src/routes/publicInvitations.routes.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: invitations.routes.ts (owner — proje izolasyon middleware'i)**

```typescript
import { Router } from 'express'
import { invitationsController } from '../controllers/invitations.controller'
import { requireAuth } from '../middleware/auth'
import { requireProjectAccess } from '../middleware/requireProjectAccess'

const router = Router({ mergeParams: true })

// Tüm endpoint'ler auth + proje izolasyon ister; mutate'ler manager+ rolü
router.use(requireAuth)

router.post('/', requireProjectAccess('manager'), invitationsController.create)
router.get('/', requireProjectAccess('user'), invitationsController.list)
router.delete('/:id', requireProjectAccess('manager'), invitationsController.cancel)

export default router
```

> `requireProjectAccess(role)` parametresinin mevcut signature'ı projedeki haline uyarlanmalı; ör. `requireProjectAccess({ minRole: 'manager' })`. Mevcut `server/src/middleware/requireProjectAccess.ts` API'sini kontrol edip aynı pattern'i kullan.

- [ ] **Step 2: meInvitations.routes.ts**

```typescript
import { Router } from 'express'
import { meInvitationsController } from '../controllers/meInvitations.controller'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

router.get('/', meInvitationsController.list)
router.post('/:id/accept', meInvitationsController.accept)
router.post('/:id/reject', meInvitationsController.reject)

export default router
```

- [ ] **Step 3: publicInvitations.routes.ts (no auth, rate-limited)**

```typescript
import { Router } from 'express'
import { publicInvitationsController } from '../controllers/publicInvitations.controller'
import { inviteAcceptMinuteLimiter, inviteAcceptHourlyLimiter } from '../middleware/invitationRateLimit'

const router = Router()

router.get(
  '/by-token/:token',
  inviteAcceptMinuteLimiter,
  inviteAcceptHourlyLimiter,
  publicInvitationsController.preview,
)
router.post(
  '/accept-by-token',
  inviteAcceptMinuteLimiter,
  inviteAcceptHourlyLimiter,
  publicInvitationsController.accept,
)

export default router
```

- [ ] **Step 4: index.ts mount**

`server/src/routes/index.ts` içinde:

```diff
+ import invitationsRoutes from './invitations.routes'
+ import meInvitationsRoutes from './meInvitations.routes'
+ import publicInvitationsRoutes from './publicInvitations.routes'

  // ... mevcut route mount'ları ...

+ router.use('/projeler/:projeId/invitations', invitationsRoutes)
+ router.use('/me/invitations', meInvitationsRoutes)
+ router.use('/invitations', publicInvitationsRoutes)
```

`projeler/:projeId/invitations` mount yolunda `:projeId` param `invitationsRoutes` içinde `req.params.projeId` olarak erişilebilir (mergeParams true).

- [ ] **Step 5: Smoke test (manuel curl)**

```bash
cd server && npm run dev
# Başka terminal:
curl -X GET http://localhost:3001/api/me/invitations
# Expected: 401 Unauthorized (auth yok)
curl -X GET http://localhost:3001/api/invitations/by-token/invalid-token
# Expected: 404 veya 400 (davet yok)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/invitations.routes.ts server/src/routes/meInvitations.routes.ts server/src/routes/publicInvitations.routes.ts server/src/routes/index.ts
git commit -m "feat(server): mount invitation routes"
```

---

### Task 13: Eski admin invite Endpoint'ini Kaldır

**Files:**
- Modify: `server/src/services/admin.service.ts` — `inviteUser` metodunu kaldır
- Modify: `server/src/controllers/admin.controller.ts` — `inviteUser` handler kaldır
- Modify: `server/src/routes/admin.routes.ts` — invite route satırı kaldır
- Modify: `server/src/schemas/admin.schema.ts` — invite schema kaldır (varsa)

- [ ] **Step 1: admin.service.ts inviteUser fonksiyonunu sil**

Dosyada `async inviteUser(body: ...) { ... }` bloğunu sil (Task 9'da gösterilen lines ~92–168).

- [ ] **Step 2: admin.controller.ts invite handler sil**

`adminController.inviteUser` veya benzeri handler'ı sil.

- [ ] **Step 3: admin.routes.ts**

```diff
- router.post('/users/invite', adminController.inviteUser)
```

- [ ] **Step 4: admin.schema.ts (varsa invite schema'sı)**

`inviteUserSchema` ve benzeri export'ları sil. İmportları temizle.

- [ ] **Step 5: tsc kontrol**

Run: `cd server && npx tsc --noEmit`
Expected: 0 hata. Eğer "unused import" uyarısı varsa temizle.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/admin.service.ts server/src/controllers/admin.controller.ts server/src/routes/admin.routes.ts server/src/schemas/admin.schema.ts
git commit -m "refactor(server): remove legacy /api/admin/users/invite (yeni invitations service'e taşındı)"
```

---

### Task 14: Integration Smoke Test

**Files:**
- Create: `server/tests/integration/invitations.smoke.test.ts`

- [ ] **Step 1: Test dosyasını yaz**

`server/tests/integration/invitations.smoke.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { supabaseAdmin } from '../../src/lib/supabase'
import { invitationService } from '../../src/services/invitation.service'

const TEST_PROJE_ID = process.env.TEST_PROJE_ID
const TEST_OWNER_ID = process.env.TEST_OWNER_ID

describe.skipIf(!TEST_PROJE_ID || !TEST_OWNER_ID)('invitations smoke', () => {
  const testEmail = `e2e-invite-${Date.now()}@example.invalid`

  afterAll(async () => {
    // Temizlik
    await supabaseAdmin.from('invitations').delete().eq('email', testEmail)
  })

  it('owner davet eder → invitations row + status=pending + token mevcut', async () => {
    const res = await invitationService.createInvitation({
      projeId: TEST_PROJE_ID!,
      email: testEmail,
      invitedRole: 'user',
      invitedBy: TEST_OWNER_ID!,
      invitedByName: 'Test Owner',
    })
    expect(res.id).toBeDefined()
    expect(res.isNewUser).toBe(true)
    expect(res.email).toBe(testEmail)

    const { data } = await supabaseAdmin
      .from('invitations')
      .select('status, token, otp_hash, attempt_count')
      .eq('id', res.id)
      .single()
    expect(data?.status).toBe('pending')
    expect(data?.token).toBeTruthy()
    expect(data?.otp_hash).toBeTruthy()
    expect(data?.attempt_count).toBe(0)
  })

  it('aynı (proje, email) için ikinci pending davet 409', async () => {
    await expect(
      invitationService.createInvitation({
        projeId: TEST_PROJE_ID!,
        email: testEmail,
        invitedRole: 'user',
        invitedBy: TEST_OWNER_ID!,
        invitedByName: 'Test Owner',
      }),
    ).rejects.toThrow(/bekleyen davet/i)
  })

  it('yanlış OTP 5 kez → status=expired', async () => {
    // Bu test öncekinin pending davetini kullanır
    const { data: inv } = await supabaseAdmin
      .from('invitations')
      .select('token')
      .eq('email', testEmail)
      .eq('status', 'pending')
      .single()
    expect(inv?.token).toBeTruthy()

    for (let i = 0; i < 5; i++) {
      await expect(
        invitationService.acceptInvitationByToken(inv!.token!, '000000', 'NewPass!23'),
      ).rejects.toThrow()
    }

    const { data: after } = await supabaseAdmin
      .from('invitations')
      .select('status, attempt_count')
      .eq('token', inv!.token!)
      .single()
    expect(after?.status).toBe('expired')
    expect(after?.attempt_count).toBe(5)
  })
})
```

> **Test infra notu:** `TEST_PROJE_ID` + `TEST_OWNER_ID` env vars'ı tanımlı değilse suite skip eder. Lokal Supabase'de bir test projesi + owner user_id'si oluşturup `.env.test` veya CI env'e koymak gerekir. Mevcut integration test pattern'ı (ör. `server/tests/integration/projeUyelikleri.smoke.test.ts`) varsa onun env setup'ı taklit edilir.

- [ ] **Step 2: Çalıştır**

Run: `cd server && npx vitest run tests/integration/invitations.smoke.test.ts`
Expected: PASS (TEST_PROJE_ID + TEST_OWNER_ID set ise) ya da SKIP.

- [ ] **Step 3: Commit**

```bash
git add server/tests/integration/invitations.smoke.test.ts
git commit -m "test(server): invitations integration smoke (3 case)"
```

---

### Task 15: Phase 1 — Pull Request (PR-A)

- [ ] **Step 1: Branch push**

```bash
git push -u origin feature/invitation-otp-flow
```

- [ ] **Step 2: PR aç**

```bash
gh pr create --base master --title "feat(invitations): yeni davet akışı backend (DB + service + endpoints + tests)" --body "$(cat <<'EOF'
## Summary

Spec: `docs/superpowers/specs/2026-05-21-invitation-flow-design.md`

Davet akışı yeniden tasarımı — backend kısmı. `auth.admin.inviteUserByEmail` magic-link akışı tamamen yeni `invitations` tablosu + OTP + transactional mail ile değiştirildi.

## Değişiklikler

**DB:**
- `invitations` tablosu (proje_id, email, user_id, token, otp_hash, attempt_count, status, expires_at)
- RLS: owner/manager kendi projesinin davetlerini, kullanıcı kendi davetini görür
- `fn_audit_invitations` trigger

**Backend:**
- `invitation.service.ts` — create/accept-by-token/accept-by-id/reject/list/cancel + preview
- `mailer.service.ts` — Resend wrapper (stub fallback)
- 3 controller (owner / me / public) + 3 route dosyası
- IP rate-limit: 5/dk + 30/saat (`accept-by-token` + `by-token` GET)
- `app.set('trust proxy', 1)` Render arkasında doğru IP
- Eski `POST /api/admin/users/invite` kaldırıldı

**Test:**
- Unit: helpers (token/OTP/Argon2)
- Integration smoke: pending insert + duplicate 409 + 5-yanlış-OTP expired

## Test Plan

- [x] `npx tsc --noEmit` clean (server)
- [x] Unit tests PASS
- [ ] Integration smoke PASS (TEST_PROJE_ID + TEST_OWNER_ID set olduğunda)
- [ ] Migration Supabase'e push edilir (manuel) — `20260522000001_invitations_table.sql`, `20260522000002_fn_audit_invitations.sql`
- [ ] Render env: `RESEND_API_KEY` + `MAIL_FROM` set edilir
- [ ] Manuel: curl /api/me/invitations (401 unauth doğru)

## Sıradaki (PR-B, PR-C)

- PR-B: Frontend public DavetKabulPage + Banner + Hook
- PR-C: KullaniciYonetimi 3 sekme + ProjeListPage badge + SifreBelirlePage silinmesi + E2E

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Review bekle / hızlıysa kendi merge'le**

```bash
gh pr view --web
# Veya direk merge (Vercel preview OK ise):
# gh pr merge --squash --delete-branch
```

> **Önemli:** Migration'lar production Supabase'e push edilene + Render env'i set edilene kadar PR-B/PR-C başlatılmaz; aksi halde frontend boş endpoint çağırır. Eğer Supabase migration lokal+staging'de test edildiyse, master merge ile birlikte production migration push edilir (Supabase deploy adımı manuel).

---

## PHASE 2 — Frontend Public (PR-B)

PR-A merge sonrası `feature/invitation-otp-flow-frontend` branch master'dan.

### Task 16: TypeScript Tipleri

**Files:**
- Create: `client/src/types/invitation.ts`

- [ ] **Step 1: Dosyayı yaz**

```typescript
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type InvitedRole = 'manager' | 'user'

export interface MyInvitation {
  id: string
  proje_id: string
  proje_adi: string
  invited_role: InvitedRole
  invited_by_email: string | null
  expires_at: string
  created_at: string
}

export interface ProjectInvitation {
  id: string
  email: string
  user_id: string | null
  invited_role: InvitedRole
  invited_by: string | null
  status: InvitationStatus
  expires_at: string
  attempt_count: number
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
}

export interface InvitationPreview {
  email: string
  proje_adi: string
  invited_by_email: string | null
  expires_at: string
  expired: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/types/invitation.ts
git commit -m "feat(client): invitation TS types"
```

---

### Task 17: API Wrapper

**Files:**
- Create: `client/src/lib/invitationsApi.ts`

- [ ] **Step 1: Dosyayı yaz**

Mevcut axios instance'ı / fetch wrapper'ı incele (örn. `client/src/lib/api.ts`). Pattern'i takip ederek:

```typescript
import { api } from './api' // mevcut axios wrapper
import type {
  MyInvitation,
  ProjectInvitation,
  InvitationPreview,
  InvitedRole,
  InvitationStatus,
} from '../types/invitation'

export const invitationsApi = {
  // Owner
  async create(projeId: string, body: { email: string; projectRole: InvitedRole }) {
    const { data } = await api.post(`/projeler/${projeId}/invitations`, body)
    return data as { id: string; projeId: string; email: string; isNewUser: boolean; expiresAt: string }
  },
  async listForProject(projeId: string, status?: InvitationStatus[]) {
    const params = status?.length ? { status: status.join(',') } : undefined
    const { data } = await api.get<ProjectInvitation[]>(`/projeler/${projeId}/invitations`, { params })
    return data
  },
  async cancel(projeId: string, id: string) {
    await api.delete(`/projeler/${projeId}/invitations/${id}`)
  },

  // Authenticated user (me)
  async listMine() {
    const { data } = await api.get<MyInvitation[]>('/me/invitations')
    return data
  },
  async acceptMine(id: string) {
    const { data } = await api.post<{ projeId: string; role: InvitedRole }>(`/me/invitations/${id}/accept`)
    return data
  },
  async rejectMine(id: string) {
    const { data } = await api.post<{ ok: true }>(`/me/invitations/${id}/reject`)
    return data
  },

  // Public (no auth)
  async previewByToken(token: string) {
    const { data } = await api.get<InvitationPreview>(`/invitations/by-token/${encodeURIComponent(token)}`)
    return data
  },
  async acceptByToken(body: { token: string; otp: string; password: string }) {
    const { data } = await api.post<{ email: string; projeId: string }>('/invitations/accept-by-token', body)
    return data
  },
}
```

- [ ] **Step 2: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/invitationsApi.ts
git commit -m "feat(client): invitations API wrapper"
```

---

### Task 18: useMyInvitations Hook

**Files:**
- Create: `client/src/hooks/useMyInvitations.ts`

- [ ] **Step 1: Hook dosyasını yaz**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invitationsApi } from '../lib/invitationsApi'

export function useMyInvitations() {
  return useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => invitationsApi.listMine(),
    staleTime: 60_000,
  })
}

export function useAcceptMyInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invitationsApi.acceptMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invitations'] })
      qc.invalidateQueries({ queryKey: ['projeler'] })
    },
  })
}

export function useRejectMyInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invitationsApi.rejectMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invitations'] })
    },
  })
}
```

> `['projeler']` queryKey mevcut projeler listesi sorgu key'i ile aynı olmalı; `client/src/pages/projeler/ProjeListPage.tsx` veya `client/src/contexts/ProjectContext.tsx` içinde gerçek key'i kontrol edip eşle.

- [ ] **Step 2: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useMyInvitations.ts
git commit -m "feat(client): useMyInvitations react-query hook"
```

---

### Task 19: DavetKabulPage

**Files:**
- Create: `client/src/pages/auth/DavetKabulPage.tsx`

- [ ] **Step 1: Sayfa dosyasını yaz**

```tsx
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Input, Result, Spin, Typography } from 'antd'
import { LockOutlined, KeyOutlined, MailOutlined } from '@ant-design/icons'
import { invitationsApi } from '../../lib/invitationsApi'
import { supabase } from '../../lib/supabase'
import type { InvitationPreview } from '../../types/invitation'

interface FormValues {
  otp: string
  password: string
  confirmPassword: string
}

export const DavetKabulPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [errorState, setErrorState] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invitationsApi
      .previewByToken(token)
      .then((p) => {
        if (cancelled) return
        if (p.expired) {
          setErrorState('Davetin süresi dolmuş veya artık geçerli değil.')
        } else {
          setPreview(p)
        }
      })
      .catch((err: any) => {
        if (cancelled) return
        const status = err?.response?.status
        if (status === 404 || status === 400) {
          setErrorState('Davet bulunamadı. Linki kontrol edin veya yöneticiyle iletişime geçin.')
        } else if (status === 429) {
          setErrorState('Çok fazla istek. Lütfen birkaç dakika sonra tekrar deneyin.')
        } else {
          setErrorState('Önizleme alınamadı. Lütfen daha sonra tekrar deneyin.')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (values: FormValues) => {
    if (!preview) return
    setLoading(true)
    try {
      await invitationsApi.acceptByToken({ token, otp: values.otp, password: values.password })
      // Otomatik login
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: preview.email,
        password: values.password,
      })
      if (loginErr) {
        message.error('Davet kabul edildi ancak otomatik giriş yapılamadı. Login sayfasına yönlendiriliyorsunuz.')
        navigate('/login')
        return
      }
      message.success('Davet kabul edildi. Yönlendiriliyorsunuz...')
      setTimeout(() => navigate('/'), 1200)
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      if (status === 429) {
        message.error('Çok fazla istek. Lütfen biraz bekleyin.')
      } else if (status === 400 && typeof data?.error === 'string') {
        message.error(data.error)
      } else {
        message.error('Davet tamamlanamadı. Lütfen daha sonra tekrar deneyin.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (previewLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (errorState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Result
          status="error"
          title="Davet kullanılamıyor"
          subTitle={errorState}
          extra={
            <Link to="/login">
              <Button type="primary">Giriş Sayfasına Dön</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (!preview) return null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 520 }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          Daveti Tamamlayın
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          <strong>"{preview.proje_adi}"</strong> projesine davet edildiniz.
          Maildeki 6 haneli doğrulama kodunu girin ve şifrenizi belirleyin.
        </Typography.Paragraph>

        <Alert
          type="info"
          showIcon
          message={`Davet ${new Date(preview.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerlidir.`}
          style={{ marginBottom: 16 }}
        />

        <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item label="E-Posta">
            <Input prefix={<MailOutlined />} value={preview.email} disabled />
          </Form.Item>
          <Form.Item
            name="otp"
            label="6 Haneli Doğrulama Kodu"
            rules={[
              { required: true, message: 'Kodu girin' },
              { pattern: /^\d{6}$/, message: '6 haneli olmalı' },
            ]}
          >
            <Input prefix={<KeyOutlined />} placeholder="123456" maxLength={6} inputMode="numeric" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Yeni Şifre"
            rules={[
              { required: true, message: 'Şifre girin' },
              { min: 8, message: 'En az 8 karakter' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Yeni şifre" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Yeni Şifre (Tekrar)"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Tekrar girin' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('Şifreler eşleşmiyor'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Yeni şifre (tekrar)" autoComplete="new-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Daveti Tamamla ve Giriş Yap
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/auth/DavetKabulPage.tsx
git commit -m "feat(client): DavetKabulPage public route (OTP + password form)"
```

---

### Task 20: App.tsx Routes + SifreBelirlePage Sil

**Files:**
- Modify: `client/src/App.tsx`
- Delete: `client/src/pages/SifreBelirlePage.tsx`

- [ ] **Step 1: App.tsx import güncelle**

```diff
- import { SifreBelirlePage } from './pages/SifreBelirlePage'
+ import { DavetKabulPage } from './pages/auth/DavetKabulPage'
```

- [ ] **Step 2: Route güncelle**

```diff
- <Route path="/sifre-belirle" element={<SifreBelirlePage />} />
+ <Route path="/davet-kabul/:token" element={<DavetKabulPage />} />
```

- [ ] **Step 3: SifreBelirlePage dosyasını sil**

```bash
git rm client/src/pages/SifreBelirlePage.tsx
```

- [ ] **Step 4: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata. SifreBelirlePage'e başka import varsa temizle.

- [ ] **Step 5: Lokal smoke test**

```bash
cd client && npm run dev
# Tarayıcı: http://localhost:5173/davet-kabul/invalid-token
# Expected: "Davet kullanılamıyor" error state
```

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/pages/SifreBelirlePage.tsx
git commit -m "feat(client): /davet-kabul/:token route + remove /sifre-belirle"
```

---

### Task 21: InvitationBanner

**Files:**
- Create: `client/src/components/InvitationBanner.tsx`
- Modify: `client/src/components/AdminLayout.tsx`

- [ ] **Step 1: Banner component yaz**

```tsx
import React from 'react'
import { Alert, Button, Popconfirm, Space, Tag, Typography } from 'antd'
import { useMyInvitations, useAcceptMyInvitation, useRejectMyInvitation } from '../hooks/useMyInvitations'

const { Text } = Typography

export const InvitationBanner: React.FC = () => {
  const { data: invitations, isLoading } = useMyInvitations()
  const accept = useAcceptMyInvitation()
  const reject = useRejectMyInvitation()

  if (isLoading || !invitations?.length) return null

  return (
    <div style={{ padding: '12px 16px 0' }}>
      {invitations.map((inv) => (
        <Alert
          key={inv.id}
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={
            <Space wrap>
              <Text strong>"{inv.proje_adi}"</Text>
              <Text>projesine</Text>
              <Tag color="blue">{inv.invited_role}</Tag>
              <Text>rolüyle davet edildiniz.</Text>
              <Text type="secondary">
                ({new Date(inv.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerli)
              </Text>
            </Space>
          }
          action={
            <Space>
              <Button
                type="primary"
                size="small"
                loading={accept.isPending && accept.variables === inv.id}
                onClick={() => accept.mutate(inv.id)}
              >
                Kabul Et
              </Button>
              <Popconfirm
                title="Daveti reddetmek istediğinize emin misiniz?"
                onConfirm={() => reject.mutate(inv.id)}
                okText="Evet, Reddet"
                cancelText="Vazgeç"
              >
                <Button danger size="small" loading={reject.isPending && reject.variables === inv.id}>
                  Reddet
                </Button>
              </Popconfirm>
            </Space>
          }
          closable={false}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: AdminLayout'a mount et**

`AdminLayout.tsx` içinde `<Content>` üstüne (veya layout yapısına uygun yere) ekle:

```diff
+ import { InvitationBanner } from './InvitationBanner'

  // ... layout render ...
  <Layout>
    <MainHeader ... />
+   <InvitationBanner />
    <Content style={{ ... }}>
      <Outlet />
    </Content>
  </Layout>
```

> `AdminLayout.tsx`'in gerçek yapısını incele; banner'ın header altında, content üstünde olmasını sağla.

- [ ] **Step 3: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/InvitationBanner.tsx client/src/components/AdminLayout.tsx
git commit -m "feat(client): InvitationBanner mounted in AdminLayout"
```

---

### Task 22: Phase 2 — Pull Request (PR-B)

- [ ] **Step 1: Branch push**

```bash
git push -u origin feature/invitation-otp-flow-frontend
```

- [ ] **Step 2: PR aç**

```bash
gh pr create --base master --title "feat(invitations): yeni davet akışı frontend (DavetKabulPage + Banner)" --body "$(cat <<'EOF'
## Summary

Spec: `docs/superpowers/specs/2026-05-21-invitation-flow-design.md`
Backend: PR-A (merged).

## Değişiklikler

**Yeni dosyalar:**
- `client/src/types/invitation.ts` — TS tipleri
- `client/src/lib/invitationsApi.ts` — axios wrapper'lar
- `client/src/hooks/useMyInvitations.ts` — react-query
- `client/src/pages/auth/DavetKabulPage.tsx` — public route `/davet-kabul/:token`
- `client/src/components/InvitationBanner.tsx` — dashboard banner

**Değişen:**
- `client/src/App.tsx` — `/davet-kabul/:token` route, `/sifre-belirle` route kaldırıldı
- `client/src/components/AdminLayout.tsx` — InvitationBanner mount

**Silinen:**
- `client/src/pages/SifreBelirlePage.tsx`

## Test Plan

- [x] `npx tsc --noEmit` (client) clean
- [ ] Lokal: `/davet-kabul/invalid-token` → error state
- [ ] Lokal: login sonrası banner → Kabul/Red butonları (mock pending davet ile)
- [ ] Production smoke: yeni davet → mail link açılır → OTP girilir → şifre belirle → otomatik giriş

## Sıradaki (PR-C)

- KullaniciYonetimi 3 sekme (Aktif / Bekleyen / Geçmiş) — eski admin invite endpoint'i artık yok, refactor zorunlu
- ProjeListPage Bekleyen Davetler section
- E2E spec (invitation-flow.spec.ts)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> **Önemli:** PR-B merge sonrası `KullaniciYonetimiPage` davet modal'ı eski endpoint'i çağırmaya çalışır — bu PR'da fix edilmemiş. PR-C ASAP açılmalı; bu boşluk Bilinen Sınırlama olarak PR-B description'da belirtilebilir. **Tercihen PR-B + PR-C aynı sprint'te peşpeşe merge edilir** ki kullanıcılar bu pencere içinde sorun yaşamasın.

---

## PHASE 3 — Owner UI + Cleanup (PR-C)

PR-B merge sonrası `feature/invitation-otp-flow-cleanup` branch master'dan.

### Task 23: KullaniciYonetimiPage Refactor

**Files:**
- Modify: `client/src/pages/admin/KullaniciYonetimiPage.tsx`

- [ ] **Step 1: Mevcut sayfa yapısını oku**

```bash
cat client/src/pages/admin/KullaniciYonetimiPage.tsx | head -100
```

Mevcut: "Aktif Üyeler" tablosu + "Üye Davet Et" modal (eski endpoint).

- [ ] **Step 2: Davet modal endpoint'ini güncelle**

`/api/admin/users/invite` çağırmayı `invitationsApi.create(activeProjeId, { email, projectRole })` ile değiştir:

```typescript
import { invitationsApi } from '../../lib/invitationsApi'

// Modal submit handler:
const handleInvite = async (values: { email: string; projectRole: 'manager' | 'user' }) => {
  setSubmitting(true)
  try {
    const res = await invitationsApi.create(activeProjeId, values)
    message.success(
      res.isNewUser
        ? 'Davet e-postası gönderildi. Kullanıcı linki tıklayarak kayıt olacak.'
        : 'Davet gönderildi. Kullanıcı uygulamadan kabul/red seçecek.',
    )
    setModalOpen(false)
    form.resetFields()
    // İnvalidate ilgili sorgular
    queryClient.invalidateQueries({ queryKey: ['project-invitations', activeProjeId] })
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 409) {
      message.error('Bu e-mail için bekleyen davet var. Önce iptal etmeniz gerekiyor.')
    } else {
      message.error('Davet gönderilemedi: ' + (err?.response?.data?.error ?? err.message))
    }
  } finally {
    setSubmitting(false)
  }
}
```

- [ ] **Step 3: 3 Tab yapısına geçir**

Mevcut tablo "Aktif Üyeler" tab'i. İki yeni tab ekle:

```typescript
import { Tabs } from 'antd'
import type { ProjectInvitation } from '../../types/invitation'

const { data: pendingInvites } = useQuery({
  queryKey: ['project-invitations', activeProjeId, 'pending'],
  queryFn: () => invitationsApi.listForProject(activeProjeId, ['pending']),
  enabled: !!activeProjeId,
})

const { data: historyInvites } = useQuery({
  queryKey: ['project-invitations', activeProjeId, 'history'],
  queryFn: () => invitationsApi.listForProject(activeProjeId, ['accepted', 'rejected', 'expired']),
  enabled: !!activeProjeId,
})

const cancelInvite = useMutation({
  mutationFn: (id: string) => invitationsApi.cancel(activeProjeId, id),
  onSuccess: () => {
    message.success('Davet iptal edildi')
    queryClient.invalidateQueries({ queryKey: ['project-invitations', activeProjeId] })
  },
})

// render:
<Tabs
  defaultActiveKey="active"
  items={[
    {
      key: 'active',
      label: 'Aktif Üyeler',
      children: <MevcutAktifUyelerTablosu />,  // Mevcut tablo aynı
    },
    {
      key: 'pending',
      label: `Bekleyen Davetler (${pendingInvites?.length ?? 0})`,
      children: (
        <Table<ProjectInvitation>
          dataSource={pendingInvites}
          rowKey="id"
          columns={[
            { title: 'E-Mail', dataIndex: 'email' },
            { title: 'Rol', dataIndex: 'invited_role' },
            { title: 'Davet Tarihi', dataIndex: 'created_at', render: (v) => new Date(v).toLocaleDateString('tr-TR') },
            { title: 'Geçerlilik', dataIndex: 'expires_at', render: (v) => new Date(v).toLocaleDateString('tr-TR') },
            { title: 'Deneme', dataIndex: 'attempt_count' },
            {
              title: 'Aksiyon',
              render: (_, row) => (
                <Popconfirm
                  title="Daveti iptal et?"
                  onConfirm={() => cancelInvite.mutate(row.id)}
                >
                  <Button danger size="small">İptal</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: 'history',
      label: 'Geçmiş',
      children: (
        <Table<ProjectInvitation>
          dataSource={historyInvites}
          rowKey="id"
          columns={[
            { title: 'E-Mail', dataIndex: 'email' },
            { title: 'Rol', dataIndex: 'invited_role' },
            { title: 'Durum', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
            { title: 'Davet Tarihi', dataIndex: 'created_at', render: (v) => new Date(v).toLocaleDateString('tr-TR') },
            {
              title: 'Aksiyon',
              render: (_, row) =>
                ['rejected', 'expired'].includes(row.status) ? (
                  <Button
                    size="small"
                    onClick={() =>
                      invitationsApi
                        .create(activeProjeId, { email: row.email, projectRole: row.invited_role })
                        .then(() => {
                          message.success('Tekrar davet edildi')
                          queryClient.invalidateQueries({ queryKey: ['project-invitations', activeProjeId] })
                        })
                        .catch((err) => message.error(err?.response?.data?.error ?? 'Hata'))
                    }
                  >
                    Tekrar Davet Et
                  </Button>
                ) : null,
            },
          ]}
        />
      ),
    },
  ]}
/>
```

- [ ] **Step 4: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 5: Lokal smoke**

```bash
cd client && npm run dev
# Tarayıcı: /admin/kullanicilar
# - Aktif Üyeler tab'i mevcut tablo
# - Bekleyen Davetler tab'i boş (yeni endpoint çalışıyor, hata yok)
# - Geçmiş tab'i boş
# - Davet Et modal → yeni e-mail → 201 success message
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/KullaniciYonetimiPage.tsx
git commit -m "feat(client): KullaniciYonetimi 3 sekme (Aktif/Bekleyen/Geçmiş) + yeni invite endpoint"
```

---

### Task 24: ProjeListPage Badge Section

**Files:**
- Modify: `client/src/pages/projeler/ProjeListPage.tsx`

- [ ] **Step 1: Bekleyen Davetler section ekle**

ProjeListPage'in mevcut tablosunun **altına** yeni bir bölüm ekle:

```tsx
import { useMyInvitations, useAcceptMyInvitation, useRejectMyInvitation } from '../../hooks/useMyInvitations'
import { Divider, Tag, Popconfirm } from 'antd'

// ... mevcut component içinde ...
const { data: myInvitations } = useMyInvitations()
const accept = useAcceptMyInvitation()
const reject = useRejectMyInvitation()

// ... mevcut tablo render'ından sonra ...
{myInvitations && myInvitations.length > 0 && (
  <>
    <Divider />
    <Typography.Title level={4}>Bekleyen Davetler ({myInvitations.length})</Typography.Title>
    <Table
      dataSource={myInvitations}
      rowKey="id"
      pagination={false}
      columns={[
        { title: 'Proje Adı', dataIndex: 'proje_adi' },
        { title: 'Rol', dataIndex: 'invited_role', render: (r) => <Tag color="blue">{r}</Tag> },
        { title: 'Davet Tarihi', dataIndex: 'created_at', render: (v) => new Date(v).toLocaleDateString('tr-TR') },
        { title: 'Geçerlilik', dataIndex: 'expires_at', render: (v) => new Date(v).toLocaleDateString('tr-TR') },
        {
          title: 'Aksiyon',
          render: (_, row: any) => (
            <Space>
              <Button type="primary" size="small" onClick={() => accept.mutate(row.id)}>Kabul Et</Button>
              <Popconfirm title="Reddetmek istediğinize emin misiniz?" onConfirm={() => reject.mutate(row.id)}>
                <Button danger size="small">Reddet</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]}
    />
  </>
)}
```

- [ ] **Step 2: tsc kontrol**

Run: `cd client && npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/projeler/ProjeListPage.tsx
git commit -m "feat(client): ProjeListPage Bekleyen Davetler section"
```

---

### Task 25: E2E Smoke Spec

**Files:**
- Create: `client/e2e/invitation-flow.spec.ts`

- [ ] **Step 1: Spec dosyasını yaz**

```typescript
import { test, expect, Page } from '@playwright/test'

test.describe('Davet akışı — public smoke', () => {
  test('/davet-kabul/invalid-token error state gösterir', async ({ page }) => {
    await page.goto('/davet-kabul/invalid-token-xxx')
    await expect(page.getByText(/Davet kullanılamıyor/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /Giriş Sayfasına Dön/i })).toBeVisible()
  })

  test('/davet-kabul boş token gösterimi', async ({ page }) => {
    // React Router :token zorunlu; /davet-kabul/ (slash sonu) ile davranış
    await page.goto('/davet-kabul/x')
    // Sayfa yine de yüklenmeli; spin sonrası error state
    await expect(page.getByText(/Davet kullanılamıyor|Önizleme alınamadı/i)).toBeVisible({ timeout: 15_000 })
  })

  test('login sayfasında /davet-kabul'a link yok ama doğrudan erişilebilir', async ({ page }) => {
    await page.goto('/login')
    // /davet-kabul mail link ile gelir; login sayfasında ayrıca link beklenmiyor
    // Bu test sadece /davet-kabul'a doğrudan erişimin login redirect etmediğini doğrular
    await page.goto('/davet-kabul/test')
    await expect(page).toHaveURL(/\/davet-kabul\/test$/)
  })
})

test.describe('Davet akışı — authenticated smoke (login gerektirir)', () => {
  test.beforeEach(async () => {
    test.skip(true, 'Authenticated smoke — test infra fix sonrası (issue #78)')
  })

  test('login sonrası banner görünür (mock pending invite)', async ({ page }) => {
    // Bu test login'siz çalıştırılamıyor (issue #78). Beklenen davranış:
    // - GET /api/me/invitations response'unda pending row varsa AdminLayout'ta
    //   Alert + Kabul Et + Reddet butonları görünmeli
  })

  test('KullaniciYonetimi 3 sekme render', async ({ page }) => {
    // /admin/kullanicilar üzerinde Aktif/Bekleyen/Geçmiş tab'ları
  })

  test('ProjeListPage Bekleyen Davetler section', async ({ page }) => {
    // /projeler altında bekleyen davet varsa Divider + ayrı tablo
  })
})
```

> Authenticated E2E flow'lar issue #78 fix sonrası yeşilleşecek; bu sprintte sadece public smoke geçer.

- [ ] **Step 2: Çalıştır**

Run: `cd client && npx playwright test invitation-flow.spec.ts`
Expected: 3 PASS (public) + 3 SKIP (authenticated).

- [ ] **Step 3: Commit**

```bash
git add client/e2e/invitation-flow.spec.ts
git commit -m "test(e2e): davet akışı public smoke (3 PASS / 3 SKIP)"
```

---

### Task 26: Deploy + Post-Deploy Smoke Issue

- [ ] **Step 1: Migration push (Supabase)**

Production Supabase'e:

```bash
# Supabase Dashboard > SQL Editor üzerinden veya CLI:
supabase db push --linked
```

veya manuel: SQL Editor'a sırayla:
1. `20260522000001_invitations_table.sql`
2. `20260522000002_fn_audit_invitations.sql`

`supabase migration list --linked` ile remote/local senkron olmalı.

- [ ] **Step 2: Render env vars set**

Render Dashboard → koopGenHes-server → Environment:
- `RESEND_API_KEY` = `re_xxx...` (Resend dashboard → API Keys)
- `MAIL_FROM` = `noreply@koopgenhes.com` (domain verified olmalı)

Save → Render otomatik redeploy.

- [ ] **Step 3: Post-deploy smoke issue aç**

```bash
gh issue create --title "Production post-deploy smoke — davet akışı (PR-A + PR-B + PR-C)" --body "$(cat <<'EOF'
## Bağlam

Davet akışı yeniden tasarımı (spec: `docs/superpowers/specs/2026-05-21-invitation-flow-design.md`) production'a deploy edildi. Manuel smoke checklist.

## Checklist (production owner: ozdemirfa@gmail.com)

### Yeni Kullanıcı Akışı
- [ ] Yeni e-mail için davet → Resend log'da mail gönderildi mi
- [ ] Mail içeriği: 6 haneli kod + link doğru
- [ ] Link tıklan → `/davet-kabul/<token>` açılır
- [ ] Yanlış kod 5 kez → "süresi doldu" mesajı + tekrar deneme reddedilir
- [ ] Doğru kod + zayıf şifre (< 8) → form validasyonu
- [ ] Doğru flow → otomatik login + dashboard

### Kayıtlı Kullanıcı Akışı
- [ ] Sistemde olan e-mail davet → bilgi mail geldi mi
- [ ] Kullanıcı login → AdminLayout'ta banner görünüyor
- [ ] Banner Kabul → proje erişimi açılır, RLS doğru (yeni proje data'sını görür)
- [ ] Banner Reddet → tekrar görünmez (status='rejected')
- [ ] ProjeListPage Bekleyen Davetler section aynı invite'ı gösteriyor

### Owner UI
- [ ] Kullanıcı Yönetimi'nde "Aktif" tab — mevcut üyeler
- [ ] "Bekleyen Davetler" tab — pending davet sayısı + İptal butonu çalışır
- [ ] "Geçmiş" tab — rejected/expired/accepted davet listesi + Tekrar Davet Et
- [ ] Aynı e-mail için ikinci davet → 409 conflict toast

### Brute-Force Koruma
- [ ] Rate-limit: hızlı 6 hit `/api/invitations/accept-by-token` → 429 toast
- [ ] Attempt-lockout: token başına 5 yanlış kod → expired

### audit_logs
- [ ] Supabase SQL: `SELECT * FROM audit_logs WHERE table_name='invitations' ORDER BY changed_at DESC LIMIT 10` → INSERT/UPDATE event'leri görünür

## Tamamlanma Kriteri

Tüm kutuların tıklanması veya tespit edilen bug'ların ayrı issue olarak açılması.
EOF
)"
```

- [ ] **Step 4: Commit (issue eklemiyor; sadece final state)**

Bu adım dosya değişikliği içermez; smoke issue'su açılır.

---

### Task 27: Phase 3 — Pull Request (PR-C)

- [ ] **Step 1: Branch push**

```bash
git push -u origin feature/invitation-otp-flow-cleanup
```

- [ ] **Step 2: PR aç**

```bash
gh pr create --base master --title "feat(invitations): owner UI sekmeleri + ProjeListPage badge + E2E" --body "$(cat <<'EOF'
## Summary

Spec: `docs/superpowers/specs/2026-05-21-invitation-flow-design.md`
Backend: PR-A (merged), Frontend public: PR-B (merged).

Owner UI'ı yeni davet akışına refactor eder + kullanıcı tarafı banner'ı projeler listesinde tekrar eder + minimal E2E smoke.

## Değişiklikler

**Değişen:**
- `client/src/pages/admin/KullaniciYonetimiPage.tsx` — eski admin endpoint kaldırıldı, yeni `invitationsApi.create` + 3 Tab (Aktif/Bekleyen/Geçmiş + Tekrar Davet Et + Cancel)
- `client/src/pages/projeler/ProjeListPage.tsx` — Bekleyen Davetler section (banner ile aynı hook)

**Yeni:**
- `client/e2e/invitation-flow.spec.ts` — public route smoke (3 PASS / 3 SKIP)

## Test Plan

- [x] `npx tsc --noEmit` (client) clean
- [x] Playwright public smoke 3 PASS
- [ ] Lokal: KullaniciYonetimi 3 tab render + İptal akışı
- [ ] Lokal: ProjeListPage Bekleyen Davetler section
- [ ] Production smoke (issue takipli)

## Deploy Adımları (PR merge sonrası)

1. Supabase migration push (PR-A'da yazıldı, henüz push edilmediyse)
2. Render env vars: `RESEND_API_KEY`, `MAIL_FROM`
3. Manuel post-deploy smoke (issue: davet akışı production smoke)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge sonrası lokal master sync**

```bash
gh pr merge --squash --delete-branch
git checkout master
git pull --ff-only origin master
git branch -d feature/invitation-otp-flow-cleanup
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ DB tablosu + index + RLS + audit trigger (Task 4–5)
- ✅ Backend service tüm fonksiyonlar (Task 9–10)
- ✅ 3 controller + 3 route + index.ts mount (Task 11–12)
- ✅ Eski admin invite kaldırma (Task 13)
- ✅ Rate-limit middleware + trust proxy (Task 3, 8)
- ✅ Mail provider (Resend) wrapper (Task 7)
- ✅ Argon2 OTP hash + token generation + helpers (Task 9)
- ✅ Zod schema (Task 6)
- ✅ Unit tests (helpers) (Task 9)
- ✅ Integration smoke (Task 14)
- ✅ Frontend: DavetKabulPage + Banner + Hook + API wrapper + types (Task 16–21)
- ✅ KullaniciYonetimi refactor + 3 tab (Task 23)
- ✅ ProjeListPage Bekleyen section (Task 24)
- ✅ E2E spec (Task 25)
- ✅ SifreBelirlePage silme + App.tsx route (Task 20)
- ✅ Deploy + smoke issue (Task 26)

**2. Placeholder scan:** Yok — her step'te tam kod veya net komut var. Açık sorular (mail provider seçimi, listUsers pagination, AdminLayout layout pattern'i) için her zaman lokal kontrol komutu verilmiş.

**3. Type consistency:**
- `InvitedRole = 'manager' | 'user'` her yerde tutarlı
- `InvitationStatus = 'pending'|'accepted'|'rejected'|'expired'` tutarlı
- Service fonksiyon adları (`createInvitation`, `acceptInvitationByToken`, `acceptInvitationById`, `rejectInvitationById`, `listPendingForUser`, `listForProject`, `cancelInvitation`, `getPreviewByToken`) controller'larda aynı isimle çağrılıyor
- Frontend API wrapper isimleri (`invitationsApi.create`, `listForProject`, `cancel`, `listMine`, `acceptMine`, `rejectMine`, `previewByToken`, `acceptByToken`) tüm consumer'larda aynı

**4. Açık Bağımlılıklar (kasıtlı):**
- `requireProjectAccess(role)` parametre signature'ı — Task 12'de inceleme adımı var
- `fn_set_updated_at` fonksiyon adı — Task 4'te grep doğrulama
- `audit_logs` schema kolonları — Task 5'te `fn_audit_proje_uyelikleri` referansı

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-invitation-otp-flow-plan.md`.

İki execution seçeneği:

**1. Subagent-Driven (recommended)** — Her task için fresh subagent dispatch, task'lar arası review checkpoint, hızlı iterasyon.

**2. Inline Execution** — Bu session'da task'lar peşpeşe yürütülür, phase sonu commit + push + PR ile checkpoint.

Hangi yaklaşımı istersin?
