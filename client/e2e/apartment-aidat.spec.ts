import { test, expect } from '@playwright/test'
import { login, uniqueSuffix, ensureProject } from './helpers'

test.describe('Daire Bazlı Aidat Takibi', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000)
    await login(page)
  })

  test('aidat list should show entries for all apartments even without members', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeName = `Aidat Test ${suffix}`

    // 1. Create Project
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeName)
    await page.locator('input[placeholder="Örn: A"]').fill('B')
    await page.locator('#bloklar_0_toplam_daire').fill('3') // small for test
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    // Wait for project to appear in list and select it
    const card = page.locator(`[data-testid^="project-card-"]`).filter({ hasText: projeName })
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    await card.click()
    
    // 2. Generate Serefiye Table
    await card.locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()
    await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()
    await expect(page.getByText('B - 1')).toBeVisible()

    // 3. Create Aidat Plan (Yearly)
    await page.goto('/aidatlar')
    await page.getByRole('button', { name: /yıllık plan oluştur/i }).click()
    
    // Wait for modal and confirm
    const confirmBtn = page.locator('.ant-modal-confirm-btns button:has-text("Evet")').or(page.getByRole('button', { name: 'Oluştur' }))
    await confirmBtn.waitFor({ state: 'visible' })
    await confirmBtn.click()
    
    await expect(page.getByText(/yıllık aidat planı oluşturuldu/i)).toBeVisible({ timeout: 20_000 })

    // 4. Check Aidat List
    await page.goto('/aidatlar')
    // Should see rows for B - 1, B - 2, B - 3 with "Üye Yok"
    await expect(page.getByText('B - 1')).toBeVisible()
    await expect(page.getByText('B - 2')).toBeVisible()
    await expect(page.getByText('B - 3')).toBeVisible()
    
    // Note: Since no members are assigned yet, no Cari Hareket (Tahakkuk) will be created for these units.
    // Tahakkuk logic usually requires a member assigned to the unit.
  })

  test('new member assignment should sync aidat and create cari movement', async ({ page }) => {
    // 0. Ensure project
    await ensureProject(page)
    
    // 1. Create a member
    const suffix = uniqueSuffix()
    const ad = `TestAd${suffix}`
    const soyad = `TestSoyad${suffix}`
    
    await page.goto('/uyeler/yeni')
    await page.locator('#ad').fill(ad)
    await page.locator('#soyad').fill(soyad)
    await page.locator('#tc_kimlik').fill(`1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`)
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    // Wait for redirect and list to load
    await expect(page.locator('table')).toContainText(ad)
    
    // 2. Assign to a unit
    // Click edit for the new member
    await page.locator('tr').filter({ hasText: ad }).locator('.ant-btn').first().click()
    
    // Member Detail page should open. Look for Daire Sekmesi.
    await page.getByRole('tab', { name: 'Daire', exact: true }).click()
    
    // Select a unit from dropdown
    await page.locator('.ant-select').filter({ hasText: /daire seçin/i }).click()
    const option = page.locator('.ant-select-item-option').first()
    await option.waitFor({ state: 'visible' })
    await option.click()
    
    await page.getByRole('button', { name: /Kaydet/i }).click()
    await expect(page.getByText(/başarıyla/i).or(page.getByText(/güncellendi/i))).toBeVisible()
    
    // 3. Check Cari İşlemler (instead of Cari Hesaplar menu)
    await page.goto('/gelir-gider')
    // Search for member name
    await page.getByPlaceholder(/ara/i).fill(ad)
    
    // There should be a "Tahakkuk" (Dues Accrual) movement if aidat plan exists
    // Since we created one in the previous test (or it exists in DB)
    // We check if at least one row exists for this member
    await expect(page.locator('table')).toContainText(ad)
    await expect(page.locator('table')).toContainText(/tahakkuk/i)
  })
})
