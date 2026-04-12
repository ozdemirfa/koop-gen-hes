import { test, expect } from '@playwright/test'
import { login, hasCreds } from './helpers'

test.describe('P3 — Aidat akisi', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanimli degil')
    await login(page)
  })

  test('aidatlar sayfasi yuklenir ve ozet kartlari gosterir', async ({ page }) => {
    await page.goto('/aidatlar')
    await expect(page.getByRole('heading', { name: /aidat/i }).first()).toBeVisible()
    // Summary cards should be visible
    await expect(page.getByText(/toplam aidat/i)).toBeVisible()
  })

  test('gelir-gider listesi yuklenir', async ({ page }) => {
    await page.goto('/gelir-gider')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('aidat odemesi flow', async ({ page }) => {
    await page.goto('/aidatlar')
    
    // Find a 'BEKLIYOR' or 'GECIKTI' row
    const row = page.locator('.ant-table-row').filter({ hasText: /BEKLIYOR|GECIKTI/i }).first()
    
    if (await row.isVisible()) {
      await row.getByRole('button', { name: /ödeme al/i }).click()
      
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      
      // Payment date - just press enter for today
      await dialog.locator('#odeme_tarihi').click()
      await page.keyboard.press('Enter')
      
      // Confirm payment
      const okBtn = dialog.locator('.ant-modal-footer button').filter({ hasText: /OK|Tamam|Kaydet/i }).first()
      await okBtn.click()
      
      // Success message
      await expect(page.getByText(/ödeme kaydedildi/i)).toBeVisible({ timeout: 10_000 })
    }
  })
})
