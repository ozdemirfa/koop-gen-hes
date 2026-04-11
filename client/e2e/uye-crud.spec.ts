import { test, expect } from '@playwright/test'
import { login, hasCreds, uniqueSuffix } from './helpers'

test.describe('P2 — Uye yonetimi', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanimli degil')
    await login(page)
  })

  test('yeni uye olustur ve listede gorun', async ({ page }) => {
    const suffix = uniqueSuffix()
    const ad = `Test${suffix}`
    const soyad = `Uye${suffix}`

    await page.goto('/uyeler/yeni')
    await page.getByLabel(/^Ad$/i).fill(ad)
    await page.getByLabel(/Soyad/i).fill(soyad)
    // Form alanları projeye özel; diğer zorunlu alanları burada doldurun
    // await page.getByLabel(/TC/i).fill('12345678901')
    await page.getByRole('button', { name: /kaydet/i }).click()

    await page.goto('/uyeler')
    await page.getByPlaceholder(/ara/i).fill(ad).catch(() => {})
    await expect(page.getByText(new RegExp(`${ad}\\s+${soyad}`))).toBeVisible({ timeout: 10_000 })
  })

  test('uye detay sayfasi acilir', async ({ page }) => {
    await page.goto('/uyeler')
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await expect(page).toHaveURL(/\/uyeler\/[^/]+$/)
  })
})
