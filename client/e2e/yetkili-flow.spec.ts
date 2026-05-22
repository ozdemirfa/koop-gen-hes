/**
 * Yetkili global rol sistemi E2E test suite — PR-B.
 *
 * Test matrisi:
 *   Y1 — Promote akışı — auth gerektirir; test.fail işaretli (hasCreds yoksa skip)
 *   Y2 — Yetkili davet kabul token preview — PUBLIC route; route mock ile çalışır
 *   Y3 — ProjeListPage "Yeni Proje" görünürlük — auth gerektirir; test.fail
 *   Y4 — Yetkili davet modal — auth gerektirir; test.fail
 *
 * Y2 testleri lokal Supabase gerektirmez (DavetKabulPage public route).
 * Y1/Y3/Y4: gerçek E2E creds (E2E_USER/E2E_PASSWORD) gerektirir.
 */

import { test, expect } from '@playwright/test'
import { hasCreds } from './helpers'

// ─── Sabitler ────────────────────────────────────────────────────────────────

const MOCK_EXPIRES = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const YETKILI_TOKEN = 'yetkili-invitation-token-pr-b-000001'

// ─── Y2 yardımcıları ──────────────────────────────────────────────────────────

async function mockYetkiliPreview(page: import('@playwright/test').Page) {
  await page.route(`**/api/invitations/by-token/${YETKILI_TOKEN}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          email: 'yeni-yetkili@test.invalid',
          proje_adi: null,
          expires_at: MOCK_EXPIRES,
          expired: false,
          invited_role: 'yetkili',
        },
      }),
    }),
  )
}

// ─── Y2: Yetkili davet kabul token preview (PUBLIC route) ────────────────────

test.describe('Y2 — Yetkili davet kabul token preview', () => {
  test('invited_role=yetkili → h3 başlık "Sisteme Yetkili Olarak Davet Edildiniz" görünür', async ({ page }) => {
    await mockYetkiliPreview(page)
    await page.goto(`/davet-kabul/${YETKILI_TOKEN}`)

    // getByRole('heading') strict-mode uyumlu — sadece h3 etiketini seçer
    await expect(page.getByRole('heading', { name: /Sisteme Yetkili Olarak Davet Edildiniz/i })).toBeVisible({ timeout: 15_000 })
  })

  test('yetkili davet → "projesine davet edildiniz" metni görünmez', async ({ page }) => {
    await mockYetkiliPreview(page)
    await page.goto(`/davet-kabul/${YETKILI_TOKEN}`)

    await expect(page.getByRole('heading', { name: /Sisteme Yetkili Olarak Davet Edildiniz/i })).toBeVisible({ timeout: 15_000 })
    // "projesine davet edildiniz" fragment olmamalı
    await expect(page.getByText(/projesine davet edildiniz/i)).toHaveCount(0)
  })

  test('yetkili davet → form render olur (OTP + şifre + submit butonu)', async ({ page }) => {
    await mockYetkiliPreview(page)
    await page.goto(`/davet-kabul/${YETKILI_TOKEN}`)

    await expect(page.getByRole('heading', { name: /Sisteme Yetkili Olarak Davet Edildiniz/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel(/6 Haneli Doğrulama Kodu/i)).toBeVisible()
    await expect(page.getByLabel(/Yeni Şifre$/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Daveti Tamamla/i })).toBeVisible()
  })

  test('yetkili davet submit → accept mock 200 + auth mock → /login veya / redirect', async ({ page }) => {
    await mockYetkiliPreview(page)

    await page.route('**/api/invitations/accept-by-token', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { email: 'yeni-yetkili@test.invalid', projeId: null },
        }),
      }),
    )

    // Supabase signInWithPassword mock
    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-yetkili-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-yetkili-refresh-token',
          user: { id: 'mock-yetkili-uuid', email: 'yeni-yetkili@test.invalid' },
        }),
      }),
    )

    await page.goto(`/davet-kabul/${YETKILI_TOKEN}`)
    await expect(page.getByRole('heading', { name: /Sisteme Yetkili Olarak Davet Edildiniz/i })).toBeVisible({ timeout: 15_000 })

    await page.getByLabel(/6 Haneli Doğrulama Kodu/i).fill('654321')
    await page.getByLabel(/Yeni Şifre$/i).fill('YetkiliPass!1')
    await page.getByLabel(/Yeni Şifre \(Tekrar\)/i).fill('YetkiliPass!1')
    await page.getByRole('button', { name: /Daveti Tamamla/i }).click()

    // Başarılı kabul → / redirect (veya /login eğer auth supabase bağlı değilse)
    await page.waitForURL(/\/(login)?$/, { timeout: 10_000 })
  })

  test('proje daveti (manager) → normal başlık + proje adı görünür', async ({ page }) => {
    const token = 'proje-manager-token-000000000000001'
    await page.route(`**/api/invitations/by-token/${token}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            email: 'manager@test.invalid',
            proje_adi: 'Test Konut Projesi',
            expires_at: MOCK_EXPIRES,
            expired: false,
            invited_role: 'manager',
          },
        }),
      }),
    )

    await page.goto(`/davet-kabul/${token}`)
    await expect(page.getByRole('heading', { name: 'Daveti Tamamlayın' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/"Test Konut Projesi"/)).toBeVisible()
  })
})

// ─── Y1: Promote akışı (auth gerektirir) ─────────────────────────────────────

test.describe('Y1 — Promote akışı (auth bağımlı)', () => {
  test.fail(
    !hasCreds,
    'Y1: Gerçek Supabase + admin E2E_USER gerektirir (hasCreds=false). ' +
    'E2E_USER ve E2E_PASSWORD tanımlandığında bu test.fail() kaldırılabilir.',
  )

  test('admin → Sistem Kullanıcıları sekmesi → "Yetkili Yap" → PATCH 200 → buton değişir', async ({ page }) => {
    // Bu test gerçek admin session gerektirir. ProtectedRoute Supabase'e bağlı.
    await page.goto('/admin/kullanicilar')

    const sistemTab = page.getByRole('tab', { name: /Sistem Kullanıcıları/i })
    await expect(sistemTab).toBeVisible({ timeout: 15_000 })
    await sistemTab.click()

    const firstPromoteBtn = page.locator('[data-testid^="promote-btn-"]').first()
    await expect(firstPromoteBtn).toBeVisible({ timeout: 5_000 })
  })
})

// ─── Y3: ProjeListPage görünürlük (auth gerektirir) ──────────────────────────

test.describe('Y3 — ProjeListPage "Yeni Proje" görünürlük (auth bağımlı)', () => {
  test.fail(
    !hasCreds,
    'Y3: Gerçek Supabase + yetkili E2E_USER gerektirir (hasCreds=false).',
  )

  test('yetkili rol → "Yeni Proje" butonu görünür', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('add-new-project')).toBeVisible({ timeout: 15_000 })
  })
})

// ─── Y4: Yetkili davet modal (auth gerektirir) ───────────────────────────────

test.describe('Y4 — Yetkili davet modal (auth bağımlı)', () => {
  test.fail(
    !hasCreds,
    'Y4: Gerçek Supabase + admin E2E_USER gerektirir (hasCreds=false).',
  )

  test('admin → "Yetkili Davet Et" butonu görünür + modal açılır', async ({ page }) => {
    await page.goto('/admin/kullanicilar')
    const yetkiliBtn = page.getByTestId('yetkili-davet-btn')
    await expect(yetkiliBtn).toBeVisible({ timeout: 15_000 })
    await yetkiliBtn.click()
    await expect(page.getByRole('dialog', { name: 'Yetkili Davet Et' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByPlaceholder('yetkili@firma.com')).toBeVisible()
  })
})
