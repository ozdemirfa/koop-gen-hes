import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should navigate between different pages without sticking', async ({ page }) => {
    // Start at Dashboard
    await page.goto('/')
    
    // Wait for title to be "Dashboard" (from usePageSettings)
    // Note: The previous test looked for "Yönetim Paneli", let's check what actually appears.
    await expect(page.locator('#header-left')).toContainText('Dashboard')

    // Navigate to Üye Yönetimi
    await page.click('text=Üye Yönetimi')
    await expect(page).toHaveURL(/\/uyeler/)
    await expect(page.locator('#header-left')).toContainText('Üye Yönetimi')

    // Navigate to Aidat Yönetimi
    await page.click('text=Aidat Yönetimi')
    await expect(page).toHaveURL(/\/aidatlar/)
    await expect(page.locator('#header-left')).toContainText('Aidat Yönetimi')

    // Navigate back to Dashboard
    await page.click('text=Dashboard')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#header-left')).toContainText('Dashboard')
  })

  test('should handle sub-menu navigation', async ({ page }) => {
    await page.goto('/')
    
    // Click Gelir / Gider group
    await page.click('text=Gelir / Gider')
    
    // Click İşlemler
    await page.click('text=İşlemler')
    await expect(page).toHaveURL(/\/gelir-gider$/)
    
    // Click Kategoriler
    await page.click('text=Kategoriler')
    await expect(page).toHaveURL(/\/gelir-gider\/kategoriler/)
  })
})
