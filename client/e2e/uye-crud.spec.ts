import { test, expect } from '@playwright/test'
import { login, hasCreds, uniqueSuffix } from './helpers'

test.describe('P2 — Uye yonetimi', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanimli degil')
    await login(page)
  })

  test('yeni uye olustur ve listede gorun', async ({ page }) => {
    const suffix = uniqueSuffix()
    const ad = `Test${suffix}`
    const soyad = `Uye${suffix}`

    await page.goto('/uyeler/yeni')
    await page.getByLabel(/^Ad$/i).fill(ad)
    await page.getByLabel(/Soyad/i).fill(soyad)

    // Blok ve Daire zorunlu: aktif projede bir blok seçilip müsait daire atanmalı
    await page.locator('#blok_id').click()
    // Wait for dropdown and press enter on first option
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    
    // Stability wait for daire options to load (triggered by blok change)
    await page.waitForTimeout(2000)
    
    // Open daire select
    await page.locator('#serefiye_id').click()
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Use a more specific button selector
    const saveBtn = page.locator('.ant-card button').filter({ hasText: /Kaydet/i }).first()
    await saveBtn.click()

    // Başarı toast'u veya listeye yönlendirme
    await expect(page.getByText(/üye eklendi/i).or(page.getByText(/üye güncellendi/i))).toBeVisible({ timeout: 15_000 })

    await page.goto('/uyeler')
    await page.getByPlaceholder(/ara/i).fill(ad)
    await expect(page.getByText(new RegExp(`${ad}\\s+${soyad}`))).toBeVisible({ timeout: 15_000 })
  })

  test('uye detay sayfasi acilir', async ({ page }) => {
    await page.goto('/uyeler')
    const firstRow = page.locator('.ant-table-row').first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await expect(page).toHaveURL(/\/uyeler\/[^/]+$/)
  })
})
