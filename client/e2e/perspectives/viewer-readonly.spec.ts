import { test, expect, Page } from '@playwright/test'
import { loginAs, hasViewerCreds, E2E_VIEWER_USER, E2E_VIEWER_PASSWORD } from '../helpers'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 6) — Viewer perspective
 *
 * Bu spec ayrı bir test kullanıcısı (E2E_VIEWER_USER / E2E_VIEWER_PASSWORD) +
 * Supabase seed (viewer = proje rolü `user`, yazma yetkisi yok) ile çalışır.
 * Mevcut tek-user (E2E_USER owner) altyapısının üstüne dedicated viewer fixture
 * eklenir. Creds tanımlı değilse suite graceful skip eder (CI'da E2E_VIEWER_*
 * secret'ları eklenince otomatik aktive olur).
 *
 * Doğrulanan UI gating'i: viewer-only kullanıcı için liste sayfalarındaki primary
 * "Yeni X" aksiyon butonlarının disabled olması + AdminLayout'ta "Görüntüleyici"
 * tag'inin render edilmesi. Backend RBAC smoke (server/tests/integration/
 * rbac.smoke.test.ts) HTTP 403 reddini ayrıca kapsar; bu spec frontend disabled
 * state'in görsel/UX regresyonunu yakalar.
 *
 * Not: "Yeni Firma" butonu native `title` attribute ile tooltip gösterir
 * (DOM'da görünür metin değil) — bu yüzden tooltip metni yerine anlamlı gating
 * sinyali olan `toBeDisabled()` assert edilir.
 */

/** Bir liste sayfasına gidip primary "Yeni X" butonunun disabled olduğunu doğrular. */
async function expectPrimaryActionDisabled(page: Page, path: string, buttonName: RegExp) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const btn = page.getByRole('button', { name: buttonName }).first()
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await expect(btn).toBeDisabled()
}

test.describe('Viewer perspective — UI read-only gating', () => {
  // Dedicated viewer fixture yoksa tüm suite skip.
  test.skip(!hasViewerCreds, 'E2E_VIEWER_USER / E2E_VIEWER_PASSWORD tanımlı değil — dedicated viewer fixture gerekli')

  test.beforeEach(async ({ page }) => {
    const ok = await loginAs(page, E2E_VIEWER_USER!, E2E_VIEWER_PASSWORD!)
    if (!ok) test.skip(true, 'Viewer login başarısız — seed/altyapı eksik')
  })

  test('AdminLayout "Görüntüleyici" tag render', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // isViewerOnly && !isOfflineRestricted → role-viewer-tag görünür
    await expect(page.getByTestId('role-viewer-tag')).toBeVisible({ timeout: 15_000 })
  })

  test('FirmaListPage "Yeni Firma" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/firmalar', /Yeni Firma/i)
  })

  test('UyeListPage "Yeni Üye" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/uyeler', /Yeni Üye/i)
  })

  test('HakedisListPage "Yeni Hakediş" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/hakedisler', /Yeni Hakediş/i)
  })

  test('FaturaListPage "Yeni Fatura" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/faturalar', /Yeni Fatura/i)
  })

  test('BankaHesapListPage "Yeni Hesap" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/banka-hesaplari', /Yeni Hesap/i)
  })

  test('VirmanListPage "Yeni Virman" disabled', async ({ page }) => {
    await expectPrimaryActionDisabled(page, '/virmanlar', /Yeni Virman/i)
  })
})
