import { test, expect } from '@playwright/test'
import { login, uniqueSuffix, checkHeader } from './helpers'

test.describe('Proje Yönetimi', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should create and list projects', async ({ page }) => {
    await page.goto('/projeler')
    await checkHeader(page, 'İnşaat Projeleri')
    
    const suffix = uniqueSuffix()
    const name = `Proje ${suffix}`
    
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(name)
    await page.locator('#lokasyon').fill('Test Lokasyon')
    
    // Blok ekle
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('20')
    
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 })
  })

  test('should view project details', async ({ page }) => {
    await page.goto('/projeler')
    await page.waitForSelector('[data-testid^="project-card-"]')
    
    const firstCard = page.locator('[data-testid^="project-card-"]').first()
    const name = await firstCard.locator('h3').textContent()
    
    await firstCard.locator('[data-testid^="view-project-"]').click()
    
    await checkHeader(page, name || '')
    await expect(page.getByText(/proje detayları/i)).toBeVisible()
  })
})
