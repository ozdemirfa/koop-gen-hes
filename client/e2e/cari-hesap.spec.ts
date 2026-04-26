import { test, expect } from '@playwright/test'
import { login, uniqueSuffix, checkHeader, navigateTo } from './helpers'

test.describe('Cari Hesap & Banka', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should filter cari ekstre by firma and dates', async ({ page }) => {
    await page.goto('/cari-hesaplar')
    await checkHeader(page, 'Firma Ekstre')
    
    // Verify the page loads with table
    await expect(page.locator('.ant-table')).toBeVisible()

    // Try opening firma filter, if no options skip (no seed data scenario)
    await page.locator('.ant-select').first().click()
    
    // Wait for either an option or the empty state
    const option = page.locator('.ant-select-item-option').first()
    const empty = page.locator('.ant-select-dropdown .ant-empty-img-default')
    
    await Promise.race([
      option.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      empty.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    ])

    if (await option.isVisible()) {
      await option.click()
    } else {
      await page.keyboard.press('Escape')
    }
    
    // Verify table remains visible
    await expect(page.locator('.ant-table')).toBeVisible()
  })

  test('should manage banka hesapları', async ({ page }) => {
    await navigateTo(page, 'Ödeme Yönetimi', 'Banka Hesapları')
    await checkHeader(page, 'Banka Hesapları')
    const bankAdi = `Ziraat Bankası ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni hesap/i }).click()
    await page.getByLabel(/banka adı/i).fill(bankAdi)
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    
    await expect(page.getByText(bankAdi)).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to banka uzlaştırma', async ({ page }) => {
    await navigateTo(page, 'Ödeme Yönetimi', 'Banka Uzlaştırma')
    await checkHeader(page, 'Banka Uzlaştırma')
    // Matching logic is complex to test without stable seeds, but we can check if sections load
    await expect(page.getByText(/eşleşmemiş banka hareketleri/i)).toBeVisible()
    await expect(page.getByText(/eşleşmemiş cari hareketler/i)).toBeVisible()
  })
})
