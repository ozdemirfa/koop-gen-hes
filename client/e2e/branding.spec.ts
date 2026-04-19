import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Branding', () => {
  test('login page should have logo', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('img[alt="Logo"]')).toBeVisible()
    await expect(page.getByText('KoopGenHes Yönetim')).toBeVisible()
  })

  test('sidebar should have logo', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await expect(page.locator('img[alt="KoopGenHes Logo"]')).toBeVisible()
  })
})
