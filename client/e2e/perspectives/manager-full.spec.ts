import { test, expect, Page } from '@playwright/test'
import { loginAs, hasManagerCreds, E2E_MANAGER_USER, E2E_MANAGER_PASSWORD, checkHeader } from '../helpers'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 6) — Manager perspective
 *
 * Dedicated fixture (E2E_MANAGER_USER / E2E_MANAGER_PASSWORD) gerektirir: test
 * projesine `manager` rolüyle bağlı, owner OLMAYAN bir kullanıcı. Creds yoksa
 * suite graceful skip eder (CI'da E2E_MANAGER_* secret'ları eklenince aktive olur).
 *
 * Manager = owner + manager izinleri (isManager, canManageUsers, canDelete) ama
 * isOwner=false. Bu spec iki tarafı da doğrular:
 *  - Pozitif: operasyonel + kullanıcı yönetimi aksiyonları ENABLED.
 *  - Negatif: owner-only aksiyon (proje arşivle) manager'a GÖRÜNMEZ.
 *
 * Owner-only aksiyonların (proje arşivle/sil, owner satırı düzenle) UI gating'i
 * role-system-v2.spec.ts (owner perspektifi) + rbac.smoke (HTTP 403) ile birlikte
 * üç katmanlı kapsama sağlar.
 */

/** Bir liste sayfasına gidip primary "Yeni X" butonunun enabled olduğunu doğrular. */
async function expectPrimaryActionEnabled(page: Page, path: string, buttonName: RegExp) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const btn = page.getByRole('button', { name: buttonName }).first()
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await expect(btn).toBeEnabled()
}

/**
 * Rol-gated bir route'a (ProtectedRoute requireRole) güvenli navigasyon.
 *
 * Global admin OLMAYAN manager fixture'ı için `projectRole`, ProjectContext'in
 * ASYNC hydrate ettiği `activeProjectRole`'e bağlıdır (usePermissions.ts). Doğrudan
 * `page.goto('/admin/kullanicilar')` ile gidildiğinde, context henüz hydrate olmadan
 * ProtectedRoute `isManager=false` görüp tek seferlik /forbidden'a redirect edebilir
 * ve rol sonradan gelince geri dönmez (hydration race).
 *
 * NOT (app follow-up): bu, gerçek bir UX latent bug'ıdır — non-admin manager direkt
 * URL ile gated sayfaya girince /forbidden'a takılabilir. Kalıcı çözüm ProtectedRoute'un
 * proje-context loading'ini de beklemesidir. Bu helper testi race'e karşı sağlamlaştırır.
 */
async function gotoGatedPage(page: Page, path: string) {
  await expect(async () => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    if (new URL(page.url()).pathname.endsWith('/forbidden')) {
      throw new Error('Henüz /forbidden — projectRole hydrate olmadı, retry')
    }
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000, 3000, 5000] })
}

test.describe('Manager perspective — full operasyonel + sınırlı yönetim', () => {
  // Dedicated manager fixture yoksa tüm suite skip.
  test.skip(!hasManagerCreds, 'E2E_MANAGER_USER / E2E_MANAGER_PASSWORD tanımlı değil — dedicated manager fixture gerekli')

  test.beforeEach(async ({ page }) => {
    const ok = await loginAs(page, E2E_MANAGER_USER!, E2E_MANAGER_PASSWORD!)
    if (!ok) test.skip(true, 'Manager login başarısız — seed/altyapı eksik')
  })

  test('AdminLayout "Görüntüleyici" tag göstermez (manager viewer-only değil)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // İçerik render olsun diye sidebar'ı bekle
    await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('role-viewer-tag')).toHaveCount(0)
  })

  test('KullaniciYonetimi erişilebilir (canManageUsers=true)', async ({ page }) => {
    await gotoGatedPage(page, '/admin/kullanicilar')
    await checkHeader(page, 'Kullanıcı Yönetimi')
    // Üye listesi tablosu yüklenmeli
    await expect(page.locator('.ant-table-tbody')).toBeVisible({ timeout: 15_000 })
  })

  test('FirmaListPage "Yeni Firma" enabled', async ({ page }) => {
    await expectPrimaryActionEnabled(page, '/firmalar', /Yeni Firma/i)
  })

  test('HakedisListPage "Yeni Hakediş" enabled', async ({ page }) => {
    await expectPrimaryActionEnabled(page, '/hakedisler', /Yeni Hakediş/i)
  })

  test('CekTakibiPage "Yeni Çek" enabled', async ({ page }) => {
    await expectPrimaryActionEnabled(page, '/cek-takibi', /Yeni Çek/i)
  })

  test('Davet modal aç + role select görünür', async ({ page }) => {
    await gotoGatedPage(page, '/admin/kullanicilar')

    const inviteBtn = page.getByRole('button', { name: /Üye Davet Et/i }).first()
    await expect(inviteBtn).toBeVisible({ timeout: 15_000 })
    await inviteBtn.click()

    const modal = page.locator('[role="dialog"]:has-text("Projeye Üye Davet Et")')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByPlaceholder(/ornek@firma\.com/i)).toBeVisible()
    // projectRole select default "Kullanıcı (user)"
    await expect(modal.getByText(/Kullanıcı \(user\)/i).first()).toBeVisible()

    await modal.getByRole('button', { name: /Vazgeç/i }).first().click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })
  })

  test('Owner-only aksiyon — proje arşivle butonu manager için görünmez', async ({ page }) => {
    // Arşivle butonu yalnız current_user_role owner/admin için DOM'a render edilir
    // (ProjeListPage.tsx). Owner olmayan manager için hiç bulunmamalı.
    await page.goto('/projeler')
    await page.waitForLoadState('networkidle')
    // Proje kartlarının yüklenmesini bekle (en az bir kart başlığı)
    await expect(page.getByTestId('card-title').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid^="archive-project-"]')).toHaveCount(0)
  })
})
