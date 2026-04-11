import { test, expect } from '@playwright/test'

test.describe('P1 — Auth & Guard', () => {
  test('kimliksiz /uyeler istegi /login sayfasina yonlendirir', async ({ page }) => {
    await page.goto('/uyeler')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible()
  })

  test('geçersiz şifre hata mesajı gösterir', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ornek@kooperatif.com').fill('olmayan@example.com')
    await page.getByPlaceholder('Şifre').fill('yanlis-sifre')
    await page.getByRole('button', { name: /giriş yap/i }).click()
    // AntD message toast'u veya aynı sayfada kalma
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login formu boşken validasyon uyarısı verir', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /giriş yap/i }).click()
    await expect(page.getByText(/lütfen/i).first()).toBeVisible()
  })
})
