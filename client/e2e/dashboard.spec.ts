import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should display summary cards', async ({ page }) => {
    await page.goto('/')

    const statCards = page.locator('.ant-statistic')
    await expect(statCards).toHaveCount(6)

    await expect(page.getByText('Aktif Üye Sayısı')).toBeVisible()
    await expect(page.getByText('Toplam Gelir')).toBeVisible()
    await expect(page.getByText('Toplam Gider')).toBeVisible()
    await expect(page.getByText('Net Bakiye')).toBeVisible()
    await expect(page.getByText('Aidat Tahsilatı')).toBeVisible()
    await expect(page.getByText('Geciken Aidatlar')).toBeVisible()
  })

  test('should render page heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Yönetim Paneli' })).toBeVisible()
  })
})
