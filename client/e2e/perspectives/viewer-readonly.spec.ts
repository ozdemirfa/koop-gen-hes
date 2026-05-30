import { test, expect } from '@playwright/test'
import { loginAs, hasViewerCreds, E2E_VIEWER_USER, E2E_VIEWER_PASSWORD } from '../helpers'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 6) — `user` (görüntüleyici-alias) perspektifi
 *
 * Dedicated fixture (E2E_VIEWER_USER / E2E_VIEWER_PASSWORD): test projesine `user`
 * rolüyle bağlı, global rolü olmayan bir kullanıcı. Creds yoksa suite graceful skip
 * eder (CI'da E2E_VIEWER_* secret'ları eklenince aktive olur).
 *
 * ÖNEMLİ — gerçek izin modeli (usePermissions.ts):
 *   `user` rolü için `canEdit = true` (her üye POST/PUT yapabilir). Yani oluşturma
 *   ("Yeni X") butonları ENABLED'dır. Kısıtlamalar yalnızca:
 *     - canDelete      = false (yıkıcı işlemler manager+)
 *     - canManageUsers = false (Kullanıcı Yönetimi erişimi manager+)
 *   AdminLayout ayrıca `projectRole === 'user'` iken "Görüntüleyici" tag'i (UI ipucu)
 *   gösterir — ancak bu tag oluşturmayı engellemez (tag metni "sadece görüntüleme"
 *   dese de canEdit aktif; UX tutarsızlığı ayrı bir konu, bu spec gerçek davranışı kilitler).
 *
 * Backend RBAC smoke (server/tests/integration/rbac.smoke.test.ts) HTTP seviyesini kapsar.
 */

test.describe('user (görüntüleyici-alias) perspektifi — kısıtlı yetki gating', () => {
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

  test('Oluşturma serbest — /firmalar "Yeni Firma" enabled (canEdit=true)', async ({ page }) => {
    // user rolü düşük yetkili olsa da form girişi (POST) yapabilir → buton enabled.
    await page.goto('/firmalar')
    await page.waitForLoadState('networkidle')
    const btn = page.getByRole('button', { name: /Yeni Firma/i }).first()
    await expect(btn).toBeVisible({ timeout: 15_000 })
    await expect(btn).toBeEnabled()
  })
})
