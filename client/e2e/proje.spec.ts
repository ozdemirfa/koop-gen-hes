import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Proje Yönetimi', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000)
    await login(page)
    await page.goto('/projeler')
  })

  test('should create a new project with blocks', async ({ page }) => {
    const projeAdi = `Test Proje ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni proje/i }).click()
    
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('#aciklama').first().fill('Test Proje Açıklaması')
    
    // Bloklar
    await page.locator('input[placeholder="Örn: A"]').fill('A Blok')
    await page.locator('#bloklar_0_toplam_daire').fill('20')
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    
    await expect(page.getByText(/proje kaydedildi/i)).toBeVisible()
    await expect(page.getByText(projeAdi)).toBeVisible()
  })

  test('should navigate to project detail and see content', async ({ page }) => {
    // Ensure at least one project exists
    const cardCount = await page.locator('.ant-card').count()
    if (cardCount === 0) {
      await page.getByRole('button', { name: /yeni proje/i }).click()
      await page.locator('#proje_adi').fill('Detail Test Proje')
      await page.locator('#bloklar_0_blok_adi').fill('Blok-1')
      await page.locator('#bloklar_0_toplam_daire').fill('10')
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }

    // Click on the first project card via view icon
    const viewBtn = page.locator('[data-testid^="view-project-"]').first()
    const cardId = await viewBtn.evaluate(el => el.closest('[data-testid^="project-card-"]')?.getAttribute('data-testid'))
    const id = cardId?.replace('project-card-', '')
    
    if (id) {
      await page.goto(`/projeler/${id}`)
    } else {
      await viewBtn.click()
    }
    
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    // Actual UI has cards
    await expect(page.getByText('Proje Bilgileri')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/İş Kalemleri/i)).toBeVisible()
  })

  test('should see harcama kalemi tree in project detail', async ({ page }) => {
    // Navigate to a project detail
    const viewBtn = page.locator('[data-testid^="view-project-"]').first()
    const cardId = await viewBtn.evaluate(el => el.closest('[data-testid^="project-card-"]')?.getAttribute('data-testid'))
    const id = cardId?.replace('project-card-', '')
    
    if (id) {
      await page.goto(`/projeler/${id}`)
    } else {
      await viewBtn.click()
    }
    
    // Check for Tree structure or empty state
    await expect(page.locator('.ant-tree').or(page.getByText(/henüz harcama kalemi eklenmemiş/i))).toBeVisible({ timeout: 15000 })
  })
})
