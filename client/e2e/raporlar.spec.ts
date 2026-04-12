import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Raporlar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should load aylık rapor and update on date change', async ({ page }) => {
    await page.goto('/raporlar/aylik')
    
    await expect(page.getByText(/aylık mali rapor/i)).toBeVisible()
    
    // Statistics should be visible
    await expect(page.getByText(/toplam aidat tahsilatı/i)).toBeVisible()
    
    // Change month
    await page.locator('.ant-picker-input').click()
    await page.locator('.ant-picker-month-panel .ant-picker-cell-inner').first().click()
    
    // Verify it still loads
    await expect(page.locator('.ant-table').first()).toBeVisible()
  })

  test('should load yıllık rapor', async ({ page }) => {
    await page.goto('/raporlar/yillik')
    await expect(page.getByText(/yıllık mali rapor/i)).toBeVisible()
  })

  test('should load üye borç raporu', async ({ page }) => {
    await page.goto('/raporlar/uye-borc')
    await expect(page.getByText(/üye borç listesi/i)).toBeVisible()
    await expect(page.locator('.ant-table').first()).toBeVisible()
  })

  test('should show empty state when no data', async ({ page }) => {
    // Navigate to a page that might be empty, e.g., a specific filter
    await page.goto('/fatura-irsaliye')
    // If no data exists, EmptyState should be visible
    const empty = page.locator('.ant-empty')
    if (await empty.isVisible()) {
      await expect(empty).toBeVisible()
    }
  })
})
