import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Çek Takibi', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/cek-takibi')
  })

  test('should add a new check', async ({ page }) => {
    await page.getByRole('button', { name: /yeni çek kaydı/i }).click()
    
    // Select Firma
    await page.locator('#firma_id').click()
    await page.locator('.ant-select-item-option').first().click()
    
    await page.locator('#banka').fill('Akbank')
    await page.locator('#cek_no').fill(`CK-${uniqueSuffix().toUpperCase()}`)
    await page.locator('#tutar').fill('50000')
    
    // Vade Tarihi
    await page.locator('#vade_tarihi').click()
    // Ant Design date picker "Today" button can be tricky, try text or specific class
    const todayBtn = page.getByText('Today').or(page.locator('.ant-picker-today-btn'))
    await todayBtn.click()
    
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(/çek kaydedildi/i)).toBeVisible()
  })

  test('should update check status to odendi', async ({ page }) => {
    // Find a 'beklemede' check row
    const pendingRow = page.locator('.ant-table-row:has-text("BEKLEMEDE")').first()
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('.anticon-check-circle').click()
      await expect(page.getByText(/durum güncellendi/i)).toBeVisible()
      // Row status should change to ODENDI
      await expect(pendingRow).toContainText(/ODENDI/i)
    }
  })

  test('should filter checks', async ({ page }) => {
    // Ant Design Radio.Button often hides the input, use text or specific class
    await page.getByText('Bekleyenler').click()
    // Verify all visible rows are BEKLEMEDE
    const rows = page.locator('.ant-table-row')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/BEKLEMEDE/i)
    }
  })
})
