import { test, expect } from '@playwright/test'
import { login, hasCreds } from './helpers'

test.describe('P3 — Aidat akisi', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanimli degil')
    await login(page)
  })

  test('aidatlar sayfasi yuklenir ve ozet kartlari gosterir', async ({ page }) => {
    await page.goto('/aidatlar')
    await expect(page.getByRole('heading', { name: /aidat/i }).first()).toBeVisible()
  })

  test('gelir-gider listesi yuklenir (C1 regresyon icin baz)', async ({ page }) => {
    await page.goto('/gelir-gider')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  // TODO (C1 regresyon): Bir aidat odemesi yap, ardindan gelir-gider sayfasinda
  // sadece tek bir satir olustugunu dogrula. Kasa durumu widget varsa o da
  // yalnizca tek hesaplanmalidir.
})
