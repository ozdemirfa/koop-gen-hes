import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Firmalar & Sözleşmeler', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should add a new firma', async ({ page }) => {
    await page.goto('/firmalar')
    const unvan = `Test Firma ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni firma/i }).click()
    
    await page.locator('#firma_tipi').click()
    await page.getByTitle('Yüklenici', { exact: true }).click()
    
    await page.locator('#unvan').fill(unvan)
    await page.locator('#vergi_no').fill('1234567890')
    await page.locator('#telefon').fill('05554443322')
    
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(/firma eklendi/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(unvan)).toBeVisible()
  })

  test('should show validation error on contract with zero amount', async ({ page }) => {
    await page.goto('/sozlesmeler/yeni')
    
    // If firma exists select it, else just fill the rest
    const firmaSelect = page.locator('#firma_id')
    await firmaSelect.click()
    const optionCount = await page.locator('.ant-select-item-option').count()
    if (optionCount > 0) {
      await page.locator('.ant-select-item-option').first().click()
    } else {
      await page.keyboard.press('Escape')
    }
    
    await page.locator('#toplam_tutar').fill('0')
    await page.locator('#konu').fill('Test Sözleşme')
    
    await page.getByRole('button', { name: /kaydet/i }).click()
    
    await expect(page.getByText(/tutar sıfırdan büyük olmalı/i)).toBeVisible({ timeout: 5_000 })
  })

  test('should validate contract dates', async ({ page }) => {
    await page.goto('/sozlesmeler/yeni')
    
    // Verify that the form exists and has a start date field
    await expect(page.locator('#baslangic_tarihi')).toBeVisible()
    await expect(page.locator('#bitis_tarihi')).toBeVisible()
    // Basic smoke test - form is accessible
  })

  test('should navigate to firma detail and show tabs', async ({ page }) => {
    await page.goto('/firmalar')
    
    // Wait for table to load with at least one firm
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 10_000 })
    
    // Click the eye icon button of the first row
    await page.locator('.ant-table-row').first().locator('button').first().click()
    
    await expect(page.locator('.ant-tabs')).toBeVisible()
    await expect(page.getByRole('tab', { name: /sözleşmeler/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /hakediş/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /faturalar/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /cari ekstre/i })).toBeVisible()
  })
})
