import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should display summary cards', async ({ page }) => {
    await page.goto('/')

    const statCards = page.locator('.ant-statistic')
    await expect(statCards).toHaveCount(15)

    await expect(page.getByText('Aktif Üye Sayısı')).toBeVisible()
    await expect(page.getByText('Toplam Tahsilat')).toBeVisible()
    await expect(page.getByText('Geciken Aidatlar')).toBeVisible()
    await expect(page.getByText('Cari Bakiye')).toBeVisible()
    await expect(page.getByText('Bankalar Bakiye Toplamı')).toBeVisible()
  })

  test('should render page heading', async ({ page }) => {
    await page.goto('/')
    // usePageSettings sets the title which is rendered in #header-left
    await expect(page.locator('#header-left')).toContainText('Pano')
  })
})
