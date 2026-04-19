import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Şerefiye Sıralama', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000)
    await login(page)
  })

  test('serefiye table should sort numerically by daire_sira_no', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeName = `Sort Test ${suffix}`

    // 1. Create Project
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeName)
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('15')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    // 2. Generate Serefiye
    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeName }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()
    await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()

    // 3. Verify Order (1 should come before 2, 2 before 10, etc.)
    const rows = page.locator('tr.ant-table-row')
    const firstRowText = await rows.nth(0).locator('td').nth(1).innerText() // Daire Sıra No column
    const secondRowText = await rows.nth(1).locator('td').nth(1).innerText()
    const tenthRowText = await rows.nth(9).locator('td').nth(1).innerText()

    expect(Number(firstRowText)).toBe(1)
    expect(Number(secondRowText)).toBe(2)
    expect(Number(tenthRowText)).toBe(10)
  })
})
