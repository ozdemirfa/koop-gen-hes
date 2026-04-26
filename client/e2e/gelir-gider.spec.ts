import { test, expect } from '@playwright/test'
import { login, navigateTo, checkHeader, uniqueSuffix } from './helpers'

test.describe('Gelir/Gider (Cari İşlemler)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should list movements and filter by type', async ({ page }) => {
    await navigateTo(page, 'Ödeme Yönetimi', 'Cari Hareketler')
    await checkHeader(page, 'Cari İşlemler')
    
    await expect(page.locator('.ant-table')).toBeVisible()
    
    // Filter by type
    await page.locator('.ant-select').filter({ hasText: /Tip Filtresi/i }).click()
    await page.getByText('Gelirler').click()
    await expect(page.locator('.ant-table')).toBeVisible()
  })

  test('should manage expense categories', async ({ page }) => {
    await navigateTo(page, 'Ödeme Yönetimi', 'Gider Kategorileri')
    await checkHeader(page, 'Gider Kategorileri')
    
    const catName = `Kategori ${uniqueSuffix()}`
    await page.getByRole('button', { name: /yeni kategori/i }).click()
    await page.locator('#ad').fill(catName)
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    await expect(page.getByText(catName)).toBeVisible()
  })
})
