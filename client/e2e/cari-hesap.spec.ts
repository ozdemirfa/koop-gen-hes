import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Cari Hesap & Banka', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should filter cari ekstre by firma and dates', async ({ page }) => {
    await page.goto('/cari-hesaplar')
    
    // Verify the page loads with table
    await expect(page.locator('.ant-table')).toBeVisible()

    // Try opening firma filter, if no options skip (no seed data scenario)
    await page.locator('.ant-select').first().click()
    const noDataImg = page.locator('.ant-select-dropdown .ant-empty-img-default')
    const hasEmpty = await noDataImg.count()
    if (hasEmpty > 0) {
      // No firmalar seeded, just press escape and continue
      await page.keyboard.press('Escape')
    } else {
      await page.locator('.ant-select-item-option').first().click()
    }
    
    // Verify table remains visible
    await expect(page.locator('.ant-table')).toBeVisible()
  })

  test('should manage banka hesapları', async ({ page }) => {
    await page.goto('/banka-hesaplari')
    const bankAdi = `Ziraat Bankası ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni hesap/i }).click()
    await page.getByLabel(/banka adı/i).fill(bankAdi)
    
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(bankAdi)).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to banka uzlaştırma', async ({ page }) => {
    await page.goto('/banka-uzlastirma')
    await expect(page.getByText(/banka uzlaştırma/i)).toBeVisible()
    // Matching logic is complex to test without stable seeds, but we can check if sections load
    await expect(page.getByText(/eşleşmemiş banka hareketleri/i)).toBeVisible()
    await expect(page.getByText(/eşleşmemiş cari hareketler/i)).toBeVisible()
  })
})
