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
    await expect(page.locator('#header-left')).toContainText('Dashboard')

    // Navigate to Üye Yönetimi
    await page.click('text=Üye Yönetimi')
    await expect(page).toHaveURL(/\/uyeler/)
    await expect(page.locator('#header-left')).toContainText('Üye Yönetimi')

    // Navigate to Aidat Yönetimi
    await page.click('text=Aidat Yönetimi')
    await expect(page).toHaveURL(/\/aidatlar/)
    await expect(page.locator('#header-left')).toContainText('Aidat Yönetimi')

    // Navigate to Firma Listesi AFTER Aidatlar to see if it's stuck
    await page.click('text=Firmalar')
    await page.click('text=Firma Listesi')
    await expect(page).toHaveURL(/\/firmalar/)
    await expect(page.locator('#header-left')).toContainText('Firma Listesi')

    // Navigate back to Dashboard
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#header-left span').filter({ hasText: 'Dashboard' })).toBeVisible()
  })

  test('should handle sub-menu navigation', async ({ page }) => {
    await page.goto('/')
    
    // Click Gelir / Gider group (opens inline)
    await page.click('text=Gelir / Gider')
    
    // Click İşlemler
    await page.click('text=İşlemler')
    await expect(page).toHaveURL(/\/gelir-gider$/)
    
    // Click Kategoriler (already expanded)
    await page.click('text=Kategoriler')
    await expect(page).toHaveURL(/\/gelir-gider\/kategoriler/)
  })
})
