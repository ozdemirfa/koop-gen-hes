/**
 * E2E: aria-invalid runtime doğrulaması (A3-01)
 *
 * AntD Form.Item validation hatası tetiklendiğinde ilgili input'ta
 * `aria-invalid="true"` attribute set ediliyor mu? Erişilebilirlik için kritik —
 * ekran okuyucular hatalı alanı kullanıcıya duyurur.
 *
 * Strateji:
 * - UyeFormPage'i aç (mevcut form-validation-regression.spec.ts ile aynı senaryo)
 * - Tüm alanları boş bırakıp Kaydet'e tıkla → required validation tetiklenir
 * - Sonra geçersiz format değerler gir (TC 10 hane, geçersiz email) → format validation tetiklenir
 * - Her senaryoda input'ların aria-invalid="true" döndürdüğünü doğrula
 * - Düzelt → aria-invalid kalkıyor mu doğrula (roundtrip)
 */

import { test, expect } from '@playwright/test'
import { hasCreds, checkHeader, E2E_USER, E2E_PASSWORD } from './helpers'

async function loginAndWaitForProject(page: any) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('ornek@kooperatif.com').fill(E2E_USER!)
  await page.getByPlaceholder('Şifre').fill(E2E_PASSWORD!)
  await page.getByRole('button', { name: /giriş yap/i }).click()
  await page.waitForURL((url: URL) => !url.pathname.startsWith('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('.ant-layout-sider', { state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(2000)
}

test.describe('A3-01: aria-invalid runtime davranışı', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
  })

  test('boş zorunlu alanlar submit edilince input aria-invalid="true" olur', async ({ page }) => {
    await page.goto('/uyeler/yeni')
    await checkHeader(page, 'Yeni Üye Ekle')

    // Önce: hiçbir hata yok → aria-invalid yok (false/null)
    const adInput = page.locator('input#ad')
    const soyadInput = page.locator('input#soyad')

    const adInvalidBefore = await adInput.getAttribute('aria-invalid')
    const soyadInvalidBefore = await soyadInput.getAttribute('aria-invalid')
    expect(adInvalidBefore).not.toBe('true')
    expect(soyadInvalidBefore).not.toBe('true')

    // Submit boş form
    await page.getByRole('button', { name: /Kaydet/i }).click()

    // AntD validation tetiklenince input.aria-invalid="true" olur
    await expect(adInput).toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })
    await expect(soyadInput).toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })

    // Error message de görünür olmalı (regression safeguard)
    const adError = page.locator('.ant-form-item-explain-error').filter({ hasText: /Ad zorunlu/i }).first()
    await expect(adError).toBeVisible({ timeout: 5_000 })
  })

  test('geçersiz TC Kimlik (10 hane) girilince aria-invalid="true" olur', async ({ page }) => {
    await page.goto('/uyeler/yeni')
    await checkHeader(page, 'Yeni Üye Ekle')

    const tcInput = page.locator('input#tc_kimlik')
    await tcInput.fill('1234567890') // 10 hane — geçersiz
    await page.getByRole('button', { name: /Kaydet/i }).click()

    await expect(tcInput).toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })

    // Roundtrip: 11 haneye tamamla, blur → aria-invalid kalkmalı
    await tcInput.fill('12345678901')
    await tcInput.blur()
    await expect(tcInput).not.toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })
  })

  test('geçersiz e-posta girilince aria-invalid="true" olur', async ({ page }) => {
    await page.goto('/uyeler/yeni')

    const emailInput = page.locator('input#email')
    await emailInput.fill('gecersiz-email')
    await emailInput.blur()

    // E-posta format hatası tetiklenir
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })

    // Düzelt → aria-invalid kalkmalı
    await emailInput.fill('valid@example.com')
    await emailInput.blur()
    await expect(emailInput).not.toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 })
  })
})
