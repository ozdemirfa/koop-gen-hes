import { Page, expect } from '@playwright/test'

export const E2E_USER = process.env.E2E_USER
export const E2E_PASSWORD = process.env.E2E_PASSWORD

export const hasCreds = Boolean(E2E_USER && E2E_PASSWORD)

export async function login(page: Page) {
  if (!hasCreds) throw new Error('E2E_USER / E2E_PASSWORD ortam değişkenleri tanımlı değil')
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  
  await page.getByPlaceholder('ornek@kooperatif.com').fill(E2E_USER!)
  await page.getByPlaceholder('Şifre').fill(E2E_PASSWORD!)
  
  const loginBtn = page.getByRole('button', { name: /giriş yap/i })
  await loginBtn.waitFor({ state: 'visible' })
  await loginBtn.click()

  // Wait for login to complete - redirect away from login
  console.log('E2E: Waiting for redirect from /login...')
  
  // Debug: Check localStorage for session every 5 seconds
  const checkSession = async () => {
    const storage = await page.evaluate(() => JSON.stringify(localStorage))
    console.log(`E2E: localStorage state: ${storage.substring(0, 200)}...`)
    const sessionExists = await page.evaluate(() => {
      return Object.keys(localStorage).some(key => key.includes('auth-token'))
    })
    console.log(`E2E: Supabase session exists in storage: ${sessionExists}`)
  }

  try {
    // Check session every 5s while waiting
    const interval = setInterval(checkSession, 5000)
    
    await page.waitForURL((url) => {
      console.log(`E2E: Current URL: ${url.href}`)
      return !url.pathname.startsWith('/login')
    }, { timeout: 60_000 })
    
    clearInterval(interval)
  } catch (err) {
    await checkSession()
    console.error(`E2E: Login redirect failed. Final URL: ${page.url()}`)
    throw err
  }
  await page.waitForLoadState('networkidle')
  
  // Ensure a project is selected
  await ensureProject(page)
}

export async function navigateTo(page: Page, menuText: string, subMenuText?: string) {
  console.log(`Navigating to: ${menuText} > ${subMenuText || ''}`)
  
  // Use text-based clicking as it's most resilient to internal DOM structure changes
  await page.click(`.ant-layout-sider :text("${menuText}")`)
  
  if (subMenuText) {
    await page.waitForTimeout(500)
    await page.click(`.ant-layout-sider :text("${subMenuText}")`)
  }

  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000) // Allow for React state and animations
}

export async function checkHeader(page: Page, title: string) {
  // Use a targeted locator for the header title
  const header = page.locator('#header-left')
  await expect(header).toContainText(title, { timeout: 15000 })
}

export function uniqueSuffix() {
  return Date.now().toString(36)
}

export async function ensureProject(page: Page) {
  // Check for active project in sidebar
  const sidebar = page.locator('.ant-layout-sider')
  const activeLabel = sidebar.locator('text=AKTİF PROJE')
  
  if (await activeLabel.count() > 0) {
    return
  }

  // Go to projeler
  await page.goto('/projeler')
  await page.waitForURL('/projeler')
  await page.waitForLoadState('networkidle')
  
  // Try to find selector
  const selector = page.locator('.ant-select-selector').first()
  const selectorExists = await selector.count() > 0
  
  if (selectorExists) {
    await selector.click()
    const options = page.locator('.ant-select-item-option-content')
    if (await options.count() > 0) {
      await options.first().click()
      await page.click('button:has-text("Aktif Proje Yap")')
      await expect(activeLabel).toBeVisible({ timeout: 15000 })
      await page.goto('/')
      return
    }
  }

  // Create new project
  console.log('E2E: Creating fallback project...')
  // Wait for the button to be stable - prefer testid if available
  const newProjectBtn = page.getByTestId('add-new-project').or(page.getByRole('button', { name: 'Yeni Proje' }))
  await newProjectBtn.waitFor({ state: 'visible' })
  await newProjectBtn.click()
  
  await page.waitForSelector('.ant-modal-content', { state: 'visible', timeout: 10000 })
  
  const projectName = `E2E ${uniqueSuffix()}`
  await page.fill('input#proje_adi', projectName)
  await page.fill('input[placeholder="Örn: A"]', 'A')
  await page.fill('.ant-input-number-input', '10')
  
  await page.click('.ant-modal-footer button:has-text("Kaydet")')
  await page.waitForSelector('.ant-modal-content', { state: 'hidden', timeout: 15000 })
  
  // App usually reloads or auto-selects. Let's force check.
  await page.waitForTimeout(3000)
  await page.goto('/')
  
  if (await activeLabel.count() === 0) {
    await page.goto('/projeler')
    await page.click('.ant-select-selector')
    await page.click('.ant-select-item-option-content:first-child')
    await page.click('button:has-text("Aktif Proje Yap")')
    await expect(activeLabel).toBeVisible({ timeout: 15000 })
    await page.goto('/')
  }
}
