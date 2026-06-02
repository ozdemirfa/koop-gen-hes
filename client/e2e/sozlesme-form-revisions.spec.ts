/**
 * E2E: Sözleşme form revizyonları (sprint 20260511-uye-tahsilat-firma-revisions)
 *
 * Kapsam:
 *   - C3: Sözleşme form input'larında autoComplete=off
 *   - C4: İş kalemi modal'ında sira_no readonly + otomatik atanır
 *   - C5: Sözleşme düzenleme sonrası cache invalidation (smoke - form açılıyor mu)
 */

import { test, expect } from '@playwright/test'
import { hasCreds, login, navigateTo } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Sprint revisions: Sözleşme form', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await login(page)
  })

  test('C3: Yeni Sözleşme form input\'larında autoComplete=off', async ({ page }) => {
    await page.goto('/sozlesmeler/yeni')
    await page.waitForLoadState('networkidle')

    const form = page.locator('form').first()
    await form.waitFor({ state: 'visible', timeout: 10_000 })

    const formAutocomplete = await form.getAttribute('autocomplete')
    expect(formAutocomplete).toBe('off')

    // konu textarea, sozlesme_no input
    const konuArea = form.locator('textarea#konu')
    if (await konuArea.count() > 0) {
      expect(await konuArea.getAttribute('autocomplete')).toBe('off')
    }
  })

  test('C4: Yeni iş kalemi modal\'ında Sıra No alanı disabled ve auto-atanır', async ({ page }) => {
    // Önce mevcut bir sözleşme bulmak için ilk firma -> ilk sözleşmeye git
    await navigateTo(page, 'Firma')
    await page.waitForLoadState('networkidle')

    // API'den ilk sözleşmeyi bul
    const firstSozlesmeId = await page.evaluate(async () => {
      const tokenKey = Object.keys(localStorage).find((k) => k.includes('auth-token'))
      if (!tokenKey) return null
      const session = JSON.parse(localStorage.getItem(tokenKey)!)
      const accessToken = session.access_token
      const projectId = localStorage.getItem('activeProjectId')
      const url = `/api/sozlesmeler${projectId ? `?proje_id=${projectId}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json()
      return json?.data?.[0]?.id || null
    })

    test.skip(!firstSozlesmeId, 'API üzerinden sözleşme id alınamadı - test atlanıyor')

    await page.goto(`/sozlesmeler/${firstSozlesmeId}`)
    await page.waitForLoadState('networkidle')

    // "İş Kalemi Ekle" butonuna bas
    const addBtn = page.getByRole('button', { name: /İş Kalemi Ekle/i }).first()
    await addBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await addBtn.click()

    // Modal açıldı
    const modal = page.locator('[role="dialog"]').filter({ hasText: /İş Kalemi/i }).first()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })

    // Sıra No input'u — id="sira_no" (AntD Form.Item name'i id verir)
    const siraById = modal.locator('input#sira_no')

    // input#sira_no veya genel input - disabled mı?
    const isDisabled = await siraById.isDisabled().catch(() => false)
    expect(isDisabled).toBeTruthy()

    // Auto atanmış bir değer (>= 1) olmalı
    const val = await siraById.inputValue()
    const num = parseInt(val, 10)
    expect(num).toBeGreaterThanOrEqual(1)
  })

  test('C5: Sözleşme düzenleme sayfası açılıyor (cache invalidation smoke)', async ({ page }) => {
    const firstSozlesmeId = await page.evaluate(async () => {
      const tokenKey = Object.keys(localStorage).find((k) => k.includes('auth-token'))
      if (!tokenKey) return null
      const session = JSON.parse(localStorage.getItem(tokenKey)!)
      const accessToken = session.access_token
      const projectId = localStorage.getItem('activeProjectId')
      const url = `/api/sozlesmeler${projectId ? `?proje_id=${projectId}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json()
      return json?.data?.[0]?.id || null
    })

    test.skip(!firstSozlesmeId, 'Sözleşme yok - test atlanıyor')

    await page.goto(`/sozlesmeler/${firstSozlesmeId}/duzenle`)
    await page.waitForLoadState('networkidle')

    // Form yüklendi, firma_id pre-fill var
    const firmaSelect = page.locator('.ant-select-selection-item').first()
    await expect(firmaSelect).toBeVisible({ timeout: 10_000 })

    // Toplam tutar input'unda mevcut değer olmalı
    const toplam = page.locator('input#toplam_tutar')
    const val = await toplam.inputValue()
    expect(val.length).toBeGreaterThan(0)
  })
})
