import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Malzeme Teslim', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/fatura-irsaliye')
  })

  test('should add a new malzeme teslim and calculate total', async ({ page }) => {
    // "Yeni İrsaliye" butonuna tıkla
    await page.click('button:has-text("Yeni İrsaliye")')
    
    // Modalın açılmasını bekle
    const dialog = page.locator('.ant-modal-content')
    await expect(dialog).toBeVisible({ timeout: 10000 })
    
    // Firma seçimi
    await dialog.locator('#firma_id').click()
    await page.waitForSelector('.ant-select-item-option-content')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    
    // Teslim Tarihi - Bugünü seç
    await dialog.locator('#teslim_tarihi').click()
    await page.waitForSelector('.ant-picker-today-btn')
    await page.click('.ant-picker-today-btn')
    
    // Irsaliye No
    const irsNo = `IRS-${uniqueSuffix().toUpperCase()}`
    await dialog.locator('#irsaliye_no').fill(irsNo)
    
    // Kalemler
    // Ant Design Form.List içindeki ilk satırı doldur
    await dialog.locator('input[placeholder="Malzeme Adı"]').first().fill('Test Malzeme')
    await dialog.locator('input[aria-label="Miktar"]').first().fill('5')
    await dialog.locator('input[placeholder="Fiyat"]').first().fill('200')
    
    // Kaydet/Tamam butonu
    const okBtn = dialog.locator('.ant-modal-footer button.ant-btn-primary')
    await okBtn.click()
    
    // Başarı mesajını ve listenin güncellenmesini bekle
    await expect(page.locator('.ant-message-notice')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('table')).toContainText(irsNo)
    
    // Toplam tutarı kontrol et (5 * 200 = 1000)
    // Türkiye formatında 1.000,00 şeklinde görünebilir
    await expect(page.locator('tr:has-text("' + irsNo + '")')).toContainText(/1\.000/)
  })
})
