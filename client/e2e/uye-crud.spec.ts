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
    const tc = `1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`

    await page.goto('/uyeler/yeni')
    
    // Ant Design inputlarını id veya label ile bulma
    await page.fill('#ad', ad)
    await page.fill('#soyad', soyad)
    await page.fill('#tc_kimlik', tc)

    // Blok ve Daire seçimi
    await page.click('#blok_id')
    await page.waitForSelector('.ant-select-item-option-content')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    
    // Dairelerin yüklenmesini bekle
    await page.waitForTimeout(1000)
    
    await page.click('#serefiye_id')
    await page.waitForSelector('.ant-select-item-option-content')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Kaydet butonu
    await page.click('button[type="submit"]')

    // Başarı mesajını bekle
    await expect(page.locator('.ant-message-notice')).toContainText(/eklendi|güncellendi/i)

    // Listede kontrol et
    await page.goto('/uyeler')
    await page.fill('input[placeholder*="Ara"]', ad)
    await expect(page.locator('table')).toContainText(ad)
    await expect(page.locator('table')).toContainText(soyad)
  })

  test('uye detay sayfasi acilir', async ({ page }) => {
    await page.goto('/uyeler')
    await page.waitForSelector('.ant-table-row')
    const firstRow = page.locator('.ant-table-row').first()
    await firstRow.click()
    await expect(page).toHaveURL(/\/uyeler\/[0-9a-f-]+/)
  })
})
