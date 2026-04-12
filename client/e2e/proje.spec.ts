import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Proje Yönetimi', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/projeler')
  })

  test('should create a new project with blocks', async ({ page }) => {
    const projeAdi = `Test Proje ${uniqueSuffix()}`
    
    await page.getByRole('button', { name: /yeni proje/i }).click()
    
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('#aciklama').first().fill('Test Proje Açıklaması')
    
    // Bloklar
    await page.locator('input[placeholder="Örn: A Blok"]').fill('A Blok')
    await page.locator('#bloklar_0_toplam_daire').fill('20')
    
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    
    await expect(page.getByText(/proje kaydedildi/i)).toBeVisible()
    await expect(page.getByText(projeAdi)).toBeVisible()
  })

  test('should navigate to project detail and see content', async ({ page }) => {
    // Click on the first project card
    await page.locator('.ant-card-head-title').first().click()
    
    await expect(page.url()).toContain('/projeler/')
    // Actual UI has cards, not tabs
    await expect(page.getByText('Proje Bilgileri', { exact: true })).toBeVisible()
    await expect(page.getByText('İş Kalemleri (Ağaç Yapısı)', { exact: true })).toBeVisible()
  })

  test('should see iş kalemi tree in project detail', async ({ page }) => {
    // Navigate to a project detail
    await page.locator('.ant-card-head-title').first().click()
    
    // Check for Tree structure or empty state
    await expect(page.locator('.ant-tree').or(page.getByText(/henüz iş kalemi eklenmemiş/i))).toBeVisible()
  })
})
