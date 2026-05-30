import { Page, expect } from '@playwright/test'

export const E2E_USER = process.env.E2E_USER
export const E2E_PASSWORD = process.env.E2E_PASSWORD

export const hasCreds = Boolean(E2E_USER && E2E_PASSWORD)

// Perspektif testleri için dedicated rol fixture'ları (manager / viewer).
// Bu kullanıcılar seed migration ile test projesine `manager` / `user` (viewer)
// rolüyle bağlanmalıdır. Tanımlı değilse ilgili perspektif suite'i skip eder.
export const E2E_MANAGER_USER = process.env.E2E_MANAGER_USER
export const E2E_MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD
export const hasManagerCreds = Boolean(E2E_MANAGER_USER && E2E_MANAGER_PASSWORD)

export const E2E_VIEWER_USER = process.env.E2E_VIEWER_USER
export const E2E_VIEWER_PASSWORD = process.env.E2E_VIEWER_PASSWORD
export const hasViewerCreds = Boolean(E2E_VIEWER_USER && E2E_VIEWER_PASSWORD)

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

/**
 * Parametrik, "sessiz" login — belirtilen kullanıcıyla giriş yapar ve aktif
 * projeyi seçer. Başarılıysa `true`, login/seed altyapısı eksikse `false` döner
 * (perspektif suite'leri bu durumda graceful skip eder).
 *
 * role-system-v2.spec.ts'teki loginQuiet pattern'inin paylaşılan hâli:
 * helpers.ts:login içindeki checkSession interval'i login fail edince
 * temizlenmediği için burada sade ve idempotent bir akış kullanılır.
 */
export async function loginAs(page: Page, user: string, password: string): Promise<boolean> {
  try {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('ornek@kooperatif.com').fill(user)
    await page.getByPlaceholder('Şifre').fill(password)
    await page.getByRole('button', { name: /giriş yap/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    await ensureProject(page)
    return true
  } catch {
    return false
  }
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
  // Two rendering patterns exist:
  // 1. usePageSettings() → sets LayoutContext via useEffect → rendered in #header-left as Typography.Text span
  // 2. PageHeader component → renders <Title level={3}> inside <main> as h3 (UyeDetailPage, etc.)
  // Strategy: retry-poll until one of the two patterns has text including the title.
  await expect(async () => {
    // Pattern 1: #header-left contains the title text (any descendant)
    const headerLeftText = await page.locator('#header-left').textContent().catch(() => '')
    if (headerLeftText && headerLeftText.includes(title)) return

    // Pattern 2: PageHeader h3 in main content area
    const h3Elements = page.locator('.page-header h3, main h3')
    const h3Count = await h3Elements.count()
    for (let i = 0; i < h3Count; i++) {
      const text = await h3Elements.nth(i).textContent().catch(() => '')
      if (text && text.includes(title)) return
    }

    throw new Error(`Header "${title}" not found in #header-left or h3`)
  }).toPass({ timeout: 15_000, intervals: [300, 500, 500, 1000, 1000, 1000, 2000] })
}

export function uniqueSuffix() {
  return Date.now().toString(36)
}

export async function ensureProject(page: Page) {
  // Strategy: Check if localStorage already has activeProjectId set.
  // If so, the React ProjectContext will auto-select on load — just wait for it.
  // If not, inject the first available project ID from /api/projeler.
  //
  // v3 fix (R1): Use waitFor({ state: 'visible' }) instead of point-in-time .count() > 0
  // to avoid race condition where context hydrate hasn't resolved yet.

  // Wait for sidebar to be rendered first
  const sidebar = page.locator('.ant-layout-sider')
  await sidebar.waitFor({ state: 'visible', timeout: 15_000 })

  const activeLabel = sidebar.locator('text=AKTİF PROJE')

  // R1 fix: waitFor with timeout instead of instant .count() snapshot
  try {
    await activeLabel.waitFor({ state: 'visible', timeout: 10_000 })
    return // Project context hydrated and active label visible
  } catch {
    // Not yet visible after 10s — fall through to selection logic
  }

  // Check if localStorage has a projectId already (context may still be loading)
  const savedId = await page.evaluate(() => localStorage.getItem('activeProjectId'))
  if (savedId) {
    // Context is loading — give it more time
    try {
      await activeLabel.waitFor({ state: 'visible', timeout: 15_000 })
      return
    } catch {
      // Still not showing — continue with selection
    }
  }

  // Go to projeler and select first available project
  await page.goto('/projeler')
  await page.waitForLoadState('networkidle')

  // Wait for table rows (projects list)
  const rows = page.locator('.ant-table-row')
  try {
    await rows.first().waitFor({ state: 'visible', timeout: 10_000 })
    // Click "Aktif Yap" button on first row
    const aktifBtn = rows.first().getByRole('button', { name: /Aktif|Seç/i }).first()
    if (await aktifBtn.count() > 0) {
      await aktifBtn.click()
      await page.waitForLoadState('networkidle')
    }
  } catch {
    // No projects exist — create one
    console.log('E2E: No projects found, creating fallback project...')
    const newProjectBtn = page.getByTestId('add-new-project').or(page.getByRole('button', { name: 'Yeni Proje' }))
    await newProjectBtn.waitFor({ state: 'visible' })
    await newProjectBtn.click()

    // R2 fix: [role="dialog"] AntD 6 modal selector (.ant-modal-content artık match etmiyor)
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 10_000 })

    const projectName = `E2E ${uniqueSuffix()}`
    await page.fill('input#proje_adi', projectName)
    await page.fill('input[placeholder="Örn: A"]', 'A')
    await page.fill('.ant-input-number-input', '10')

    await page.click('.ant-modal-footer button:has-text("Kaydet")')
    // R2 fix: [role="dialog"] hidden bekleme
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15_000 })
    await page.waitForLoadState('networkidle')
  }

  await page.goto('/')
  await expect(activeLabel).toBeVisible({ timeout: 20_000 })
}
