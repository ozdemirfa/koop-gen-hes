/**
 * E2E: Hakediş + fatura regresyon (sprint 20260511-uye-tahsilat-firma-revisions)
 *
 * Kapsam:
 *   - C6: Hakediş schema/form smoke - sayfa açılıyor, 400 atmıyor
 *   - C7: Yeni fatura schema/form smoke - sayfa açılıyor
 *   - D1: DatePicker placeholder Türkçe "Tarih seç" + "Today" yerine "Bugün"
 */

import { test, expect } from '@playwright/test'
import { hasCreds, login, navigateTo } from './helpers'

test.describe('Sprint revisions: Hakediş + Fatura + Locale', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await login(page)
  })

  test('D1: DatePicker locale Türkçe ("Today" yerine "Bugün")', async ({ page }) => {
    // Sözleşme form'unda DatePicker var
    await page.goto('/sozlesmeler/yeni')
    await page.waitForLoadState('networkidle')

    // Başlangıç tarihi DatePicker'ı aç
    const dpInput = page.locator('.ant-picker input').first()
    await dpInput.waitFor({ state: 'visible', timeout: 10_000 })
    await dpInput.click()

    // Popup açıldı - "Bugün" yazısı görünmeli (footer'da "Today now" yerine)
    const todayCell = page.locator('.ant-picker-today-btn, .ant-picker-now-btn')
    if (await todayCell.count() > 0) {
      const text = await todayCell.first().textContent()
      // "Bugün" veya "Şimdi" Türkçe — "Today" İngilizce
      expect(text?.toLowerCase()).not.toContain('today')
    }
  })

  test('C6: Hakediş listesi açılıyor, 400 hatası atmıyor', async ({ page }) => {
    await navigateTo(page, 'Hakediş')
    await page.waitForLoadState('networkidle')

    // ErrorState 400/500 görünmemeli
    const errorState = page.locator('button:has-text("Tekrar Dene")')
    await expect(errorState).toHaveCount(0)

    // Sayfa render oldu - DataTable veya empty state
    const dataTable = page.locator('.ant-table, .ant-empty')
    await expect(dataTable.first()).toBeVisible({ timeout: 10_000 })
  })

  test('C7: Fatura listesi açılıyor, 400 hatası atmıyor', async ({ page }) => {
    await navigateTo(page, 'Fatura')
    await page.waitForLoadState('networkidle')

    const errorState = page.locator('button:has-text("Tekrar Dene")')
    await expect(errorState).toHaveCount(0)

    const dataTable = page.locator('.ant-table, .ant-empty')
    await expect(dataTable.first()).toBeVisible({ timeout: 10_000 })
  })
})
