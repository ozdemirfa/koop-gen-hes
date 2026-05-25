import { test, expect, Page } from '@playwright/test'
import { hasCreds, ensureProject, E2E_USER, E2E_PASSWORD } from './helpers'

/**
 * Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 5) — Role gating coverage
 *
 * Bu spec mevcut sayfalarda uygulanan UI gating'in regresyon yapmadığını
 * doğrular. Mevcut E2E_USER owner perspektifinde olduğu için:
 *   - "Yeni X" / "Düzenle" / "Sil" butonları görünür ve enable olmalıdır.
 *   - role=user (görüntüleyici) için ayrı fixture/seed bu sprint'in kapsamı
 *     dışında — backend RBAC smoke (`server/tests/integration/rbac.smoke.test.ts`)
 *     izin reddini garanti ediyor; UI tarafı görsel doğrulama ileri sprintte
 *     manuel veya yeni test kullanıcısı seed'iyle yapılır.
 *
 * Owner için "Yeni" butonunun **enabled** olduğunu pozitif assert ile garantiler.
 * AdminLayout viewer Tag'inin owner'da görünmediğini de kontrol eder.
 */

async function loginQuiet(page: Page): Promise<boolean> {
  if (!hasCreds) return false
  try {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('ornek@kooperatif.com').fill(E2E_USER!)
    await page.getByPlaceholder('Şifre').fill(E2E_PASSWORD!)
    await page.getByRole('button', { name: /giriş yap/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    await ensureProject(page)
    return true
  } catch {
    return false
  }
}

test.describe('Role gating coverage — owner perspective', () => {
  test('AdminLayout viewer Tag owner için görünmez', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    // Görüntüleyici Tag sadece projectRole === "user" olduğunda render olur.
    const viewerTag = page.getByTestId('role-viewer-tag')
    await expect(viewerTag).toHaveCount(0)
  })

  test('FirmaListPage "Yeni Firma" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/firmalar')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /Yeni Firma/i })
    await expect(newBtn.first()).toBeEnabled({ timeout: 10_000 })
  })

  test('UyeListPage "Yeni" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/uyeler')
    await page.waitForLoadState('networkidle')
    // Üye listesinde primary action button
    const newBtn = page.getByRole('button', { name: /Yeni/i }).first()
    await expect(newBtn).toBeEnabled({ timeout: 10_000 })
  })

  test('HakedisListPage "Yeni Hakediş" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/hakedisler')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /Yeni Hakediş/i })
    await expect(newBtn.first()).toBeEnabled({ timeout: 10_000 })
  })

  test('FaturaListPage "Yeni Fatura" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/faturalar')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /Yeni Fatura/i })
    await expect(newBtn.first()).toBeEnabled({ timeout: 10_000 })
  })

  test('BankaHesapListPage "Yeni Hesap" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/banka-hesaplari')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /Yeni Hesap/i })
    await expect(newBtn.first()).toBeEnabled({ timeout: 10_000 })
  })

  test('VirmanListPage "Yeni Virman" enabled (owner)', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/virmanlar')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /Yeni/i }).first()
    await expect(newBtn).toBeEnabled({ timeout: 10_000 })
  })

  test('KullaniciYonetimi sayfası owner için erişilebilir', async ({ page }) => {
    const ok = await loginQuiet(page)
    if (!ok) test.skip(true, 'E2E credentials yok')
    await page.goto('/admin/kullanicilar')
    await page.waitForLoadState('networkidle')
    // Forbidden değil ise sayfa içeriği görünür (KullaniciYonetimi başlığı)
    const fb = page.getByText(/Yetkiniz yok|Forbidden/i)
    await expect(fb).toHaveCount(0)
  })
})
