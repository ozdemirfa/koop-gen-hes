import { test, expect, Page } from '@playwright/test'
import { loginAs, hasViewerCreds, E2E_VIEWER_USER, E2E_VIEWER_PASSWORD } from '../helpers'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 6) — `user` salt-okunur perspektifi
 *
 * Dedicated fixture (E2E_VIEWER_USER / E2E_VIEWER_PASSWORD): test projesine `user`
 * rolüyle bağlı, global rolü olmayan bir kullanıcı. Creds yoksa suite graceful skip
 * eder (CI'da E2E_VIEWER_* secret'ları eklenince aktive olur).
 *
 * İzin modeli (Sprint user-role-readonly, 2026-05-30):
 *   `user` rolü artık KATI SALT-OKUNUR — yalnız `canView`. `canEdit/canDelete/
 *   canManageUsers = isManager` (owner+manager). Yani:
 *     - "Yeni X" / Düzenle / Sil butonları DISABLED.
 *     - Kullanıcı Yönetimi erişilemez (/forbidden).
 *     - "Görüntüleyici" tag'i görünür ve artık doğru (gerçekten salt-okunur).
 *   Backend birebir: yazma route'ları requireProjectAccess('manager'); user POST → 403.
 *   Backend RBAC smoke (server/tests/integration/rbac.smoke.test.ts) HTTP seviyesini kapsar.
 */

/** Bir liste sayfasına gidip primary "Yeni X" butonunun disabled olduğunu doğrular. */
async function expectPrimaryActionDisabled(page: Page, path: string, buttonName: RegExp) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const btn = page.getByRole('button', { name: buttonName }).first()
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await expect(btn).toBeDisabled()
}

test.describe('user salt-okunur perspektifi — gating', () => {
  // Dedicated viewer fixture yoksa tüm suite skip.
  test.skip(!hasViewerCreds, 'E2E_VIEWER_USER / E2E_VIEWER_PASSWORD tanımlı değil — dedicated viewer fixture gerekli')

  test.beforeEach(async ({ page }) => {
    const ok = await loginAs(page, E2E_VIEWER_USER!, E2E_VIEWER_PASSWORD!)
    if (!ok) test.skip(true, 'Viewer login başarısız — seed/altyapı eksik')
  })

  test('AdminLayout "Görüntüleyici" tag render (projectRole=user)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // isViewerOnly && !isOfflineRestricted → role-viewer-tag görünür
    await expect(page.getByTestId('role-viewer-tag')).toBeVisible({ timeout: 15_000 })
  })

  test('Kullanıcı Yönetimi erişilemez (canManageUsers=false → /forbidden)', async ({ page }) => {
    // ProtectedRoute requireRole="manager"; isManager false → /forbidden redirect.
    await page.goto('/admin/kullanicilar')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/forbidden$/, { timeout: 15_000 })
  })

  test('Sidebar "Kullanıcı Yönetimi" menü öğesi yok (canManageUsers=false)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const sider = page.locator('.ant-layout-sider')
    await expect(sider).toBeVisible({ timeout: 15_000 })
    await expect(sider.getByText(/Kullanıcı Yönetimi/i)).toHaveCount(0)
  })

  // Salt-okunur: oluşturma butonları DISABLED (canEdit = isManager → user için false).
  test('FirmaListPage "Yeni Firma" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/firmalar', /Yeni Firma/i)
  })

  test('FaturaListPage "Yeni Fatura" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/faturalar', /Yeni Fatura/i)
  })

  test('HakedisListPage "Yeni Hakediş" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/hakedisler', /Yeni Hakediş/i)
  })
})
