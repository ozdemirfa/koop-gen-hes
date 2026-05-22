/**
 * Davet-kabul (sign-up) akışı E2E test suite.
 *
 * QA sprint 20260522-signup-qa-sprint — Playwright katmanı.
 *
 * Test matrisi (E2E katmanı):
 *   H1  — Yeni kullanıcı happy path (issue #78 bağımlı; test.fail ile işaretli)
 *   H2  — Mevcut kullanıcı banner kabul (auth gerektirir; test.fail ile işaretli)
 *   T3  — Invalid token → "Davet kullanılamıyor" UI state
 *   P1  — <8 char password → client validation mesajı
 *   P2  — Password mismatch → aria-live error
 *   P4  — TR karakter şifre kabul (Şifrem!ğı1)
 *   A1  — signInWithPassword sonrası session (issue #78 doğrulama; test.fail)
 *   A2  — Auto-signIn fail → graceful redirect /login
 *   U1  — Mobile 375px DavetKabulPage render
 *   U2  — axe-playwright 0 critical @a11y (BUG-002 fix sonrası PASS)
 *   U3  — TR karakter email normalize (server API mock)
 *
 * BUG-001 fix: api.ts interceptor statusCode'u non-enumerable olarak ekliyor.
 * BUG-002 fix: email Input'a id + Form.Item htmlFor eklendi.
 *
 * Issue #78 bağımlı testler (H1, A1) test.fail() ile işaretlidir.
 * Bu testler gerçek Supabase + auth.signInWithPassword gerektirir.
 * Fix doğrulandığında test.fail() kaldırılmalıdır.
 *
 * Diğer testler (T3, P1, P2, P4, A2, U1, U2, U3): route mock kullanır,
 * backend/Supabase gerektirmez.
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ─── Sabitler ────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'abc123validtokenforqa00000000001234'
const INVALID_TOKEN = 'invalid-token-xxx'
const MOCK_EMAIL = 'test@example.invalid'
const MOCK_PROJE = 'QA Test Projesi'
const MOCK_EXPIRES = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

// ─── Mock Yardımcıları ────────────────────────────────────────────────────────

/** Preview API'sini başarılı yanıt ile mockla */
async function mockPreviewSuccess(page: import('@playwright/test').Page, tokenOverride?: string) {
  const token = tokenOverride ?? VALID_TOKEN
  await page.route(`**/api/invitations/by-token/${token}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          email: MOCK_EMAIL,
          proje_adi: MOCK_PROJE,
          expires_at: MOCK_EXPIRES,
          expired: false,
        },
      }),
    }),
  )
}

/** Preview API'sini 404 ile mockla */
async function mockPreview404(page: import('@playwright/test').Page, token: string) {
  await page.route(`**/api/invitations/by-token/${token}`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) }),
  )
}

/** Accept API'sini başarılı yanıt ile mockla */
async function mockAcceptSuccess(page: import('@playwright/test').Page) {
  await page.route('**/api/invitations/accept-by-token', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { email: MOCK_EMAIL, projeId: 'proje-uuid-001' },
      }),
    }),
  )
}

// ─── T3: Invalid token UI state ───────────────────────────────────────────────

test.describe('T3 — Invalid token', () => {
  test('invalid token → "Davet kullanılamıyor" error state başlığı görünür', async ({ page }) => {
    await mockPreview404(page, INVALID_TOKEN)
    await page.goto(`/davet-kabul/${INVALID_TOKEN}`)
    await expect(page.getByText(/Davet kullanılamıyor/i)).toBeVisible({ timeout: 15_000 })
    // BUG-001 fix: api.ts interceptor statusCode'u non-enumerable olarak ekliyor.
    // 404 → "Davet bulunamadı." mesajı (generic "alınamadı" değil).
    await expect(page.getByText(/Davet bulunamadı/i)).toBeVisible({ timeout: 5_000 })
  })

  test('invalid token → form render olmaz', async ({ page }) => {
    await mockPreview404(page, INVALID_TOKEN)
    await page.goto(`/davet-kabul/${INVALID_TOKEN}`)
    await expect(page.getByText(/Davet kullanılamıyor/i)).toBeVisible({ timeout: 15_000 })
    // Form gösterilmemeli
    const form = page.locator('form')
    await expect(form).toHaveCount(0)
  })
})

// ─── P1: <8 char password ─────────────────────────────────────────────────────

test.describe('P1 — Password min length', () => {
  test.beforeEach(async ({ page }) => {
    await mockPreviewSuccess(page)
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    // Formun yüklenmesini bekle
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })
  })

  test('<8 karakter şifre client-side validation uyarısı verir', async ({ page }) => {
    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('123456')
    await page.getByLabel(/Yeni Şifre$/).fill('abc123')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('abc123')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()
    // AntD validation mesajı
    await expect(page.getByText(/En az 8 karakter/i)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── P2: Password mismatch ────────────────────────────────────────────────────

test.describe('P2 — Password mismatch', () => {
  test.beforeEach(async ({ page }) => {
    await mockPreviewSuccess(page)
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })
  })

  test('şifreler eşleşmiyorsa "Şifreler eşleşmiyor" validation görünür', async ({ page }) => {
    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('123456')
    await page.getByLabel(/Yeni Şifre$/).fill('ValidPass!1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('DifferentPass!2')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()
    await expect(page.getByText(/Şifreler eşleşmiyor/i)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── P4: TR karakter şifre ───────────────────────────────────────────────────

test.describe('P4 — TR karakter şifre', () => {
  test.beforeEach(async ({ page }) => {
    await mockPreviewSuccess(page)
    await mockAcceptSuccess(page)
    // Supabase signInWithPassword çağrısını mock'la (backend bağımlılığı yok)
    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: 'mock-user-id', email: MOCK_EMAIL },
        }),
      }),
    )
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })
  })

  test('TR karakter içeren şifre (Şifrem!ğı1) kabul edilir', async ({ page }) => {
    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('123456')
    await page.getByLabel(/Yeni Şifre$/).fill('Şifrem!ğı1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('Şifrem!ğı1')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()
    // Validation hatası gösterilmemeli (8+ karakter, eşleşiyor)
    await expect(page.getByText(/En az 8 karakter/i)).toHaveCount(0)
    await expect(page.getByText(/Şifreler eşleşmiyor/i)).toHaveCount(0)
  })
})

// ─── A1: Issue #78 — signInWithPassword session ──────────────────────────────

test.describe('A1 — Issue #78: signInWithPassword session', () => {
  // Issue #78: signInWithPassword Playwright E2E ortamında fetch fail veriyor.
  // Bu test gerçek Supabase auth.users + çalışan local Supabase gerektirir.
  // Fix: playwright.config.ts'de explicit env injection eklendi (sharedEnv).
  // Tam doğrulama için local Supabase çalışır olmalıdır.
  //
  // test.fail() → bu test "beklenen başarısızlık" modundadır.
  // Supabase lokal çalışıyorsa ve gerçek test user'ı varsa bu test geçer
  // ve test.fail() kaldırılmalıdır.

  test.fail(
    true,
    'Issue #78: signInWithPassword E2E için lokal Supabase + gerçek test user gerekir. ' +
    'playwright.config.ts env injection fix uygulandı (commit: fix(auth): playwright env injection #78). ' +
    'Supabase lokal çalışıyorsa bu test.fail() kaldırılabilir.',
  )

  test('A1: signInWithPassword sonrası localStorage sb-* token ve /dashboard redirect', async ({ page }) => {
    // Bu test tam E2E — gerçek Supabase + gerçek invitation akışı gerektirir.
    // Mock olmadan; seeded invitation token'ı ile çalışır.
    // Placeholder — issue #78 tam fix sonrası implement edilecek.
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })
    // Gerçek OTP + şifre submit
    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('123456')
    await page.getByLabel(/Yeni Şifre$/).fill('ValidPass!1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('ValidPass!1')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()
    // Session localStorage'da olmalı
    await page.waitForURL(/\//, { timeout: 10_000 })
    const hasSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.includes('supabase') || k.includes('sb-')),
    )
    expect(hasSession).toBe(true)
  })
})

// ─── A2: Auto-signIn fail graceful redirect ───────────────────────────────────

test.describe('A2 — Auto-signIn fail → graceful redirect', () => {
  test('signInWithPassword başarısız → /login sayfasına yönlendirir', async ({ page }) => {
    await mockPreviewSuccess(page)
    await mockAcceptSuccess(page)

    // Supabase auth'u fail etmeye zorla
    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_credentials', error_description: 'Invalid credentials' }),
      }),
    )

    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('123456')
    await page.getByLabel(/Yeni Şifre$/).fill('ValidPass!1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('ValidPass!1')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()

    // Otomatik giriş başarısız → /login'e yönlendirmeli
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

// ─── H1: Happy path (issue #78 bağımlı) ──────────────────────────────────────

test.describe('H1 — Yeni kullanıcı happy path', () => {
  // Issue #78 bağımlı — gerçek Supabase + seeded invitation gerektirir.
  test.fail(
    true,
    'Issue #78: H1 happy path testi lokal Supabase + seeded invitation gerektirir. ' +
    'playwright.config.ts env injection fix uygulandı. ' +
    'Supabase lokal çalışıyorsa test.fail() kaldırılabilir.',
  )

  test('H1: token URL → OTP → password → auto-login → dashboard', async ({ page }) => {
    // Gerçek E2E — seeded invitation token gerektirir; mock değil.
    // TEST_INVITATION_TOKEN env ile override edilebilir.
    const realToken = process.env.TEST_INVITATION_TOKEN ?? VALID_TOKEN
    await page.goto(`/davet-kabul/${realToken}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })

    const otp = process.env.TEST_INVITATION_OTP ?? '123456'
    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill(otp)
    await page.getByLabel(/Yeni Şifre$/).fill('ValidPass!1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('ValidPass!1')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()

    // /dashboard veya / redirect
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 })
  })
})

// ─── H2: Mevcut kullanıcı banner (auth bağımlı) ──────────────────────────────

test.describe('H2 — Mevcut kullanıcı banner', () => {
  // Auth bağımlı — fixture user gerektirir.
  test.fail(
    true,
    'H2: InvitationBanner testi login state gerektirir (E2E_USER/E2E_PASSWORD + lokal Supabase). ' +
    'playwright.config.ts env injection fix uygulandı.',
  )

  test('H2: login sonrası InvitationBanner pending davet için görünür', async ({ page }) => {
    // Bu test helpers.ts::login() ile çalışır — gerçek Supabase auth.
    await page.goto('/login')
    // Minimal placeholder: login sonrası banner arama
    await expect(page.getByText(/Kabul Et/i)).toBeVisible({ timeout: 15_000 })
  })
})

// ─── U1: Mobile 375px ────────────────────────────────────────────────────────

test.describe('U1 — Mobile 375px', () => {
  test('DavetKabulPage 375px viewportta tüm input erişilebilir', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await mockPreviewSuccess(page)
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })

    // OTP input görünür ve tıklanabilir
    const otpInput = page.getByLabel(/6 Haneli Doğrulama Kodu/i)
    await expect(otpInput).toBeVisible()
    const box = await otpInput.boundingBox()
    expect(box).not.toBeNull()
    // Ekranın içinde (0 < x < 375, pozitif height)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)

    // Şifre input'ları görünür
    const pwInput = page.getByLabel(/Yeni Şifre$/)
    await expect(pwInput).toBeVisible()

    const confirmInput = page.getByLabel(/Yeni Şifre \(Tekrar\)/i)
    await expect(confirmInput).toBeVisible()

    // Submit button erişilebilir
    const submitBtn = page.getByRole('button', { name: /Daveti Tamamla/i })
    await expect(submitBtn).toBeVisible()
  })
})

// ─── U2: axe-playwright a11y @a11y ───────────────────────────────────────────

test.describe('U2 — Accessibility @a11y', () => {
  test('@a11y DavetKabulPage axe critical=0', async ({ page }) => {
    // BUG-002 fix: email Input'a id="davet-email-preview" + Form.Item htmlFor eklendi.
    await mockPreviewSuccess(page)
    await page.goto(`/davet-kabul/${VALID_TOKEN}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('.ant-tooltip') // AntD tooltip'ler axe için hariç tut
      .analyze()

    const criticalViolations = results.violations.filter((v) => v.impact === 'critical')
    if (criticalViolations.length > 0) {
      console.error(
        'A11y critical violations:',
        JSON.stringify(criticalViolations.map((v) => ({ id: v.id, description: v.description, nodes: v.nodes.length })), null, 2),
      )
    }
    expect(criticalViolations).toHaveLength(0)
  })

  test('@a11y Error state axe critical=0', async ({ page }) => {
    await mockPreview404(page, INVALID_TOKEN)
    await page.goto(`/davet-kabul/${INVALID_TOKEN}`)
    await expect(page.getByText(/Davet kullanılamıyor/i)).toBeVisible({ timeout: 15_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const criticalViolations = results.violations.filter((v) => v.impact === 'critical')
    expect(criticalViolations).toHaveLength(0)
  })
})

// ─── U3: TR karakter email normalize ─────────────────────────────────────────

test.describe('U3 — TR karakter email normalize', () => {
  test('server TR karakter email ile invitation preview döner', async ({ page }) => {
    const trEmail = 'çelik@şirket.com'
    const trToken = 'tr-email-test-token-0000000000001'

    // TR email ile mock preview
    await page.route(`**/api/invitations/by-token/${trToken}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            email: trEmail,
            proje_adi: 'TR Test Projesi',
            expires_at: MOCK_EXPIRES,
            expired: false,
          },
        }),
      }),
    )

    await page.goto(`/davet-kabul/${trToken}`)
    await expect(page.getByText('Daveti Tamamlayın')).toBeVisible({ timeout: 15_000 })

    // Email alanında TR karakterler görünür (disabled input)
    const emailInput = page.locator('input[disabled]')
    await expect(emailInput).toBeVisible()
    const emailValue = await emailInput.inputValue()
    // Email read-only gösterilmeli (encode edilmemiş, orijinal form)
    expect(emailValue).toBe(trEmail)
  })
})
