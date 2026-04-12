import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Gelir/Gider Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/gelir-gider')
  })

  test('should show validation errors on empty form', async ({ page }) => {
    await page.getByRole('button', { name: /yeni kayıt/i }).click()
    await page.getByRole('button', { name: 'OK', exact: true }).click()

    // Ant Design v5 shows validation messages in form item - use exact error text
    await expect(page.getByText('Please enter Kategori')).toBeVisible({ timeout: 5000 })
  })

  test('should add a new category', async ({ page }) => {
    const catName = `Test Kategori ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni kategori/i }).click()
    // The modal has a Tip select; default is 'gider', just fill the name
    await page.getByPlaceholder('Örn: Kırtasiye, Tamirat').fill(catName)
    await page.getByRole('button', { name: 'OK', exact: true }).click()

    await expect(page.getByText(/kategori eklendi/i)).toBeVisible({ timeout: 10_000 })
  })

  test('should add a new gelir-gider record', async ({ page }) => {
    await page.getByRole('button', { name: /yeni kayıt/i }).click()
    
    // Select Tip: Gelir (default is already gelir)
    // Select Kategori (wait for dropdown to populate)
    await page.locator('#kategori_id').click()
    await expect(page.locator('.ant-select-item-option').first()).toBeVisible({ timeout: 5000 })
    await page.locator('.ant-select-item-option').first().click()
    
    // Tutar
    await page.locator('#tutar').fill('1500')
    
    // Aciklama
    await page.locator('#aciklama').fill(`E2E Test Açıklama ${uniqueSuffix()}`)

    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(/kayıt oluşturuldu/i)).toBeVisible({ timeout: 10_000 })
  })

  test('should filter list by tip', async ({ page }) => {
    // Click filter select using the placeholder text
    await page.getByText('Filtre', { exact: true }).click({ force: true })
    await page.getByTitle('Gelirler').click()
    
    // Wait for table to reload; just verify no gider tags appear
    await page.waitForTimeout(1000)
    const giderTags = page.locator('.ant-tag:has-text("GIDER")')
    await expect(giderTags).toHaveCount(0)
  })
})
