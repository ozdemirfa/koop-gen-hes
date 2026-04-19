import { Page, expect } from '@playwright/test'

export const E2E_USER = process.env.E2E_USER
export const E2E_PASSWORD = process.env.E2E_PASSWORD

export const hasCreds = Boolean(E2E_USER && E2E_PASSWORD)

export async function login(page: Page) {
  if (!hasCreds) throw new Error('E2E_USER / E2E_PASSWORD ortam değişkenleri tanımlı değil')
  await page.goto('/login')
  await page.getByPlaceholder('ornek@kooperatif.com').fill(E2E_USER!)
  await page.getByPlaceholder('Şifre').fill(E2E_PASSWORD!)
  await page.getByRole('button', { name: /giriş yap/i }).click()

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
  await expect(page.locator('.ant-layout-sider, aside').first()).toBeVisible({ timeout: 15_000 })
}

export function uniqueSuffix() {
  return Date.now().toString(36)
}
