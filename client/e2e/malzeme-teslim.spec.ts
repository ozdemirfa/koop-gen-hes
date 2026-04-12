import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Malzeme Teslim', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/fatura-irsaliye')
  })

  test('should add a new malzeme teslim and calculate total', async ({ page }) => {
    // Simplest text selector if role-based fails
    await page.getByText('Yeni İrsaliye').first().click()
    
    // Stability wait for modal
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    
    // Select Firma
    await dialog.locator('#firma_id').click()
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    
    // Teslim Tarihi
    await dialog.locator('#teslim_tarihi').click()
    await page.keyboard.press('Enter') // Today is usually default or selected
    
    // Irsaliye No
    const irsNo = `IRS-${uniqueSuffix().toUpperCase()}`
    await dialog.locator('#irsaliye_no').fill(irsNo)
    
    // Kalemler (Ant Design Form.List uses names like kalemler_0_malzeme_adi)
    await dialog.locator('input[placeholder="Malzeme Adı"]').first().fill('Test Malzeme')
    await dialog.locator('input[placeholder="Miktar"]').first().fill('5')
    await dialog.locator('input[placeholder="Fiyat"]').first().fill('200')
    
    const okBtn = dialog.locator('.ant-modal-footer button').filter({ hasText: /OK|Tamam|Kaydet/i }).first()
    await okBtn.click()
    
    // Wait for any toast
    await expect(page.locator('.ant-message-notice')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(irsNo)).toBeVisible({ timeout: 10_000 })
    
    // Check total in list (5 * 200 = 1000)
    // MoneyDisplay might format it as 1.000,00 TL
    await expect(page.locator('.ant-table-row:has-text("' + irsNo + '")')).toContainText(/1\.000/i)
  })
})
