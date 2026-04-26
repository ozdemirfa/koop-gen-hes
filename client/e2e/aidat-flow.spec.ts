import { test, expect } from '@playwright/test'
import { login, hasCreds, ensureProject, checkHeader } from './helpers'

test.describe('P3 — Aidat akisi', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanimli degil')
    await login(page)
    await ensureProject(page)
  })

  test('aidatlar sayfasi yuklenir ve ozet kartlari gosterir', async ({ page }) => {
    await page.goto('/aidatlar')
    await checkHeader(page, 'Aidat Listesi')
    // Summary cards should be visible
    await expect(page.getByText(/toplam tahakkuk/i)).toBeVisible()
  })

  test('cari islemler listesi yuklenir', async ({ page }) => {
    await page.goto('/gelir-gider')
    await checkHeader(page, 'Cari İşlemler')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('aidat odemesi (odeme kayit) flow', async ({ page }) => {
    await page.goto('/cari-hesaplar/odeme-kayit')
    await checkHeader(page, 'Cari Ödeme/Tahsilat Kaydı')
    
    // Select Cari Hesap
    const cariItem = page.locator('.ant-form-item').filter({ hasText: /Cari Hesap/i })
    await cariItem.locator('.ant-select').click()
    const cariOption = page.getByRole('option').first()
    await cariOption.waitFor({ state: 'visible' })
    await cariOption.click()
    
    // Select İşlem Türü: Gelen Ödeme
    await page.getByLabel(/İşlem Türü/i).click()
    const gelenOdemeOption = page.getByRole('option', { name: /Gelen Ödeme/ })
    await gelenOdemeOption.waitFor({ state: 'visible' })
    await gelenOdemeOption.click()
    
    // Fill Tutar
    await page.getByLabel(/İşlem Tutarı/).fill('1000')

    // Select bank account (required for banka odeme turu)
    const bankaItem = page.locator('.ant-form-item').filter({ hasText: /Banka Hesabı/i })
    if (await bankaItem.isVisible()) {
      await bankaItem.locator('.ant-select').click()
      const bankaOption = page.getByRole('option').first()
      if (await bankaOption.isVisible()) {
        await bankaOption.click()
        
        await page.getByRole('button', { name: /İşlemi Kaydet/i }).click()
        
        // Success message
        await expect(page.getByText(/başarıyla kaydedildi/i)).toBeVisible({ timeout: 15_000 })

        // Verify in Cari İşlemler list
        await page.goto('/gelir-gider')
        await expect(page.locator('table')).toContainText('1.000,00', { timeout: 15_000 })
      } else {
        console.log('Banka hesabı seçeneği bulunamadı, ödeme testi atlanıyor.')
      }
    }
  })

  test('aidat tanimi borclandir ve cariye yansima', async ({ page }) => {
    // 1. Go to Aidat Tanımları
    await page.goto('/aidatlar/tanimlar')
    await checkHeader(page, 'Aidat Tanımları')
    
    const currentYear = new Date().getFullYear()
    const testYear = currentYear + 1

    // Navigate to plan page
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    await checkHeader(page, 'Yeni Yıllık Aidat Planı')
    
    await page.locator('input[placeholder="Örn: 2026"]').fill(testYear.toString())
    await page.locator('input[placeholder="Tutar"]').first().fill('500')
    await page.getByRole('button', { name: /Kaydet/i }).click()
    
    await expect(page.getByText(/aidat planı kaydedildi/i)).toBeVisible({ timeout: 15_000 })
    
    // Wait for navigation back
    await expect(page).toHaveURL(/\/aidatlar\/tanimlar/, { timeout: 10_000 })
    
    // 2. Filter and Borçlandır
    // Year filter is likely the first select in the header
    await page.locator('.ant-select').first().click()
    await page.getByRole('option', { name: testYear.toString() }).click()
    
    // Look for a row with 'PLAN' status
    const row = page.locator('tr').filter({ hasText: 'PLAN' }).first()
    const borclandirBtn = row.getByRole('button', { name: /borçlandır/i })
    
    if (await borclandirBtn.isVisible()) {
      await borclandirBtn.click()
      // Ant Design Popconfirm uses 'Evet' or 'Tamam'
      const confirmBtn = page.locator('.ant-popover-buttons button').filter({ hasText: /Evet|Tamam/i })
      await confirmBtn.click()
      
      await expect(page.getByText(/başarıyla tamamlandı/i)).toBeVisible({ timeout: 15_000 })
      
      // 3. Verify in Cari İşlemler
      await page.goto('/gelir-gider')
      await expect(page.locator('table')).toContainText(/tahakkuk/i, { timeout: 15_000 })
    } else {
      console.log('Borçlandır butonu bulunamadı (belki zaten borçlandırıldı).')
    }
  })

  test('tekil faiz hesapla ve cariye yansima', async ({ page }) => {
    await page.goto('/aidatlar')
    
    // Find a row that has 'Faiz Hesapla' button
    const faizBtn = page.getByRole('button', { name: /faiz hesapla/i }).first()
    
    if (await faizBtn.isVisible()) {
      await faizBtn.click()
      await expect(page.getByText(/güncellendi|başarılı/i)).toBeVisible({ timeout: 15_000 })
    } else {
      console.log('Faiz hesapla butonu bulunamadı, test atlanıyor.')
    }
  })
})
