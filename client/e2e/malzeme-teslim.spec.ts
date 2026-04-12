import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Malzeme Teslim', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/fatura-irsaliye')
  })

  test('should add a new malzeme teslim and calculate total', async ({ page }) => {
    await page.getByRole('button', { name: /yeni irsaliye/i }).click()
    
    // Select Firma
    await page.locator('#firma_id').click()
    await page.locator('.ant-select-item-option').first().click()
    
    // Teslim Tarihi
    await page.locator('#teslim_tarihi').click()
    await page.locator('.ant-picker-today-btn').click()
    
    // Irsaliye No
    const irsNo = `IRS-${uniqueSuffix().toUpperCase()}`
    await page.locator('#irsaliye_no').fill(irsNo)
    
    // Kalemler
    await page.locator('input[placeholder="Malzeme Adı"]').fill('Test Malzeme')
    await page.locator('input[placeholder="Miktar"]').fill('5')
    await page.locator('input[placeholder="Fiyat"]').fill('200')
    
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(/irsaliye kaydedildi/i)).toBeVisible()
    await expect(page.getByText(irsNo)).toBeVisible()
    
    // Check total in list (5 * 200 = 1000)
    // MoneyDisplay might format it as 1.000,00 TL
    await expect(page.locator('.ant-table-row:has-text("' + irsNo + '")')).toContainText(/1\.000/i)
  })
})
