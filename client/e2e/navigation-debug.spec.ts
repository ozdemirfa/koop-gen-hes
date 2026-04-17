import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Navigation Debug Flow', () => {
  const consoleErrors: string[] = []

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore Ant Design warnings that are logged as errors
        if (text.includes('antd:') || text.includes('deprecated')) return
        consoleErrors.push(`[CONSOLE ERROR] ${text}`)
      }
    })
    page.on('pageerror', exception => {
      consoleErrors.push(`[PAGE ERROR] ${exception.message}`)
    })
    
    await login(page)
  })

  const pagesToTest = [
    { label: 'Üye Yönetimi', url: '/uyeler', expectedHeader: 'Üye Yönetimi' },
    { label: 'Aidat Yönetimi', url: '/aidatlar', expectedHeader: 'Aidat Yönetimi' },
    { label: 'Gelir / Gider', subLabel: 'İşlemler', url: '/gelir-gider', expectedHeader: 'İşlemler' },
    { label: 'Firmalar', subLabel: 'Firma Listesi', url: '/firmalar', expectedHeader: 'Firma Listesi' },
    { label: 'Proje Yönetimi', url: '/projeler', expectedHeader: 'İnşaat Projeleri' },
  ]

  for (const target of pagesToTest) {
    test(`should navigate to ${target.label} ${target.subLabel || ''}`, async ({ page }) => {
      console.log(`Testing navigation to: ${target.label}`)
      
      // Go to Dashboard first to ensure consistent starting point
      await page.goto('/')
      await expect(page.locator('#header-left')).toContainText('Dashboard')

      if (target.subLabel) {
        // Handle grouped menu items
        await page.click(`text=${target.label}`)
        await page.click(`text=${target.subLabel}`)
      } else {
        await page.click(`text=${target.label}`)
      }

      // Check URL
      await expect(page).toHaveURL(new RegExp(target.url))
      
      // Check Header Title (provided by LayoutContext/usePageSettings)
      // Note: Some pages might take a moment to set the title
      await expect(page.locator('#header-left')).toContainText(target.expectedHeader, { timeout: 10000 })

      if (consoleErrors.length > 0) {
        console.error(`Errors found during navigation to ${target.label}:`, consoleErrors)
        throw new Error(`Console errors detected: ${consoleErrors.join('\n')}`)
      }
    })
  }
})
