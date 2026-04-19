import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

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
    
    // Select it as active
    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeName }).click()
    
    // 2. Generate Serefiye Table
    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeName }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()
    await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()
    await expect(page.getByText('B - 1')).toBeVisible()

    // 3. Create Aidat Plan (Yearly)
    await page.goto('/aidatlar')
    await page.getByRole('button', { name: /yıllık plan oluştur/i }).click()
    await page.locator('.ant-modal-confirm-btns button:has-text("Evet")').or(page.getByRole('button', { name: 'Oluştur' })).click()
    await expect(page.getByText(/yıllık aidat planı oluşturuldu/i)).toBeVisible()

    // 4. Check Aidat List
    await page.goto('/aidatlar')
    // Should see rows for B - 1, B - 2, B - 3 with "Üye Yok"
    await expect(page.getByText('B - 1')).toBeVisible()
    await expect(page.getByText('B - 2')).toBeVisible()
    await expect(page.getByText('B - 3')).toBeVisible()
    await expect(page.getByText(/üye yok/i).first()).toBeVisible()
  })
})
