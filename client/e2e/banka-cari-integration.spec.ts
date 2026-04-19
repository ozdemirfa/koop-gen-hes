import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Banka-Cari Entegrasyonu', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000)
    await login(page)
  })

  test('adding bank movement with firm should create cari movement', async ({ page }) => {
    const suffix = uniqueSuffix()
    const bankaAdi = `Test Banka ${suffix}`
    const firmaUnvan = `Test Firma ${suffix}`

    // 1. Create Bank Account
    await page.goto('/banka-hesaplari')
    await page.getByRole('button', { name: /yeni hesap/i }).click()
    await page.locator('#banka_adi').fill(bankaAdi)
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(bankaAdi)).toBeVisible()

    // 2. Create Firm
    await page.goto('/firmalar')
    await page.getByRole('button', { name: /yeni firma/i }).click()
    await page.locator('#unvan').fill(firmaUnvan)
    await page.locator('#firma_tipi').click()
    await page.getByText('Tedarikçi').click()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(firmaUnvan)).toBeVisible()

    // 3. Add Bank Movement
    await page.goto('/banka-hesaplari')
    await page.getByText(bankaAdi).click()
    await page.getByRole('button', { name: /yeni hareket/i }).click()
    
    await page.locator('#islem_tipi').click()
    await page.getByText('Para Çıkışı (-)').click()
    
    await page.locator('#firma_id').click()
    await page.getByText(firmaUnvan).click()
    
    await page.locator('#tutar').fill('1500')
    await page.locator('#aciklama').fill(`Entegrasyon Testi ${suffix}`)
    
    await page.getByRole('button', { name: 'Ekle' }).click()
    await expect(page.getByText(/Entegrasyon Testi/)).toBeVisible()

    // 4. Check Cari Ekstre
    await page.goto('/firmalar')
    await page.getByText(firmaUnvan).click()
    await page.getByRole('tab', { name: /cari ekstre/i }).click()
    
    // The amount should be there as "alacak" (since it's para çıkışı from bank)
    await expect(page.getByText('1.500,00')).toBeVisible()
    await expect(page.getByText(`Entegrasyon Testi ${suffix}`)).toBeVisible()
  })
})
