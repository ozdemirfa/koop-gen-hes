/**
 * E2E: Firma form revizyonları (sprint 20260511-uye-tahsilat-firma-revisions)
 *
 * Kapsam:
 *   - C1: Vergi No tam 10 hane rakam validasyonu (frontend + backend)
 *   - C2: Firma form input'larında autoComplete=off (HTML attribute kontrolü)
 *   - C8: Firma ekstre sayfası URL ?firma_id=... ile açıldığında Select doluyor
 */

import { test, expect } from '@playwright/test'
import { hasCreds, login, navigateTo } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Sprint revisions: Firma form', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await login(page)
  })

  test('C2: Yeni Firma modal input\'larında autoComplete=off attribute mevcut', async ({ page }) => {
    await navigateTo(page, 'Firma')
    await page.waitForLoadState('networkidle')

    // "Yeni Firma" tuşunu bul ve aç
    const newBtn = page.getByRole('button', { name: /Yeni Firma/i })
    await newBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await newBtn.click()

    // Modal açıldı
    const modal = page.locator('[role="dialog"]').filter({ hasText: /Yeni Firma/i }).first()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })

    // Form üst seviyesinde autocomplete=off
    const formAutocomplete = await modal.locator('form').first().getAttribute('autocomplete')
    expect(formAutocomplete).toBe('off')

    // Ünvan input'unda autocomplete=off
    const unvanInput = modal.locator('input#unvan')
    await unvanInput.waitFor({ state: 'visible' })
    expect(await unvanInput.getAttribute('autocomplete')).toBe('off')

    // Vergi No input'unda autocomplete=off
    const vergiInput = modal.locator('input#vergi_no')
    expect(await vergiInput.getAttribute('autocomplete')).toBe('off')
  })

  test('C1: Vergi No 10 hane altı veya harf girilince hata gösterir', async ({ page }) => {
    await navigateTo(page, 'Firma')
    await page.getByRole('button', { name: /Yeni Firma/i }).click()
    const modal = page.locator('[role="dialog"]').first()
    await modal.waitFor({ state: 'visible' })

    const vergiInput = modal.locator('input#vergi_no')
    await vergiInput.fill('12345') // 5 hane - geçersiz
    await vergiInput.blur()

    // 10 hane rakam mesajı görünür
    const err = page
      .locator('.ant-form-item-explain-error')
      .filter({ hasText: /10 haneli rakam/i })
      .first()
    await expect(err).toBeVisible({ timeout: 5_000 })
  })

  test('C1: Vergi No alanına harf girişi engellenir (normalize)', async ({ page }) => {
    await navigateTo(page, 'Firma')
    await page.getByRole('button', { name: /Yeni Firma/i }).click()
    const modal = page.locator('[role="dialog"]').first()
    await modal.waitFor({ state: 'visible' })

    const vergiInput = modal.locator('input#vergi_no')
    await vergiInput.fill('abc123def456')
    // normalize harfleri siler, max 10 rakam kalır
    const val = await vergiInput.inputValue()
    expect(val).toMatch(/^\d{1,10}$/)
    expect(val).not.toContain('a')
  })

  test('C8: Firma ekstre sayfası ?firma_id=... ile açılınca Select doluyor', async ({ page }) => {
    // Önce herhangi bir firma id'sini bulmak için listeyi yükle
    await navigateTo(page, 'Firma')
    await page.waitForLoadState('networkidle')

    // Liste yüklenene kadar bekle
    const firstRow = page.locator('.ant-table-row').first()
    const rowExists = await firstRow.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
    test.skip(!rowExists, 'Firma listesi boş - C8 kontrolü atlanıyor')

    // İlk firmanın id'sini state'ten al — DataTable'ın "İşlem" sütunundaki link/btn'den
    // navigation yaparak id'ye ulaşmak yerine URL parametresi simulasyonu için
    // doğrudan API üzerinden firma id'sini alıyoruz (deterministik).
    const firstFirmaId = await page.evaluate(async () => {
      const token = Object.keys(localStorage).find((k) => k.includes('auth-token'))
      if (!token) return null
      const session = JSON.parse(localStorage.getItem(token)!)
      const accessToken = session.access_token
      const projectId = localStorage.getItem('activeProjectId')
      const url = `/api/firmalar?aktif=true${projectId ? `&proje_id=${projectId}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      const json = await res.json()
      return json?.data?.[0]?.id || null
    })

    test.skip(!firstFirmaId, 'API üzerinden firma id alınamadı - test atlanıyor')

    // Firma ekstre sayfasını ?firma_id ile aç
    await page.goto(`/cari-hesaplar?firma_id=${firstFirmaId}`)
    await page.waitForLoadState('networkidle')

    // Header'daki Select kutusunda firma adı görünmeli (placeholder "Firma Seçin" görünmemeli)
    await expect(async () => {
      const placeholderVisible = await page
        .locator('.ant-select-selection-placeholder')
        .filter({ hasText: /Firma Seçin/i })
        .count()
      expect(placeholderVisible).toBe(0)

      const selectionItem = page.locator('.ant-select-selection-item').first()
      const text = await selectionItem.textContent().catch(() => '')
      expect(text && text.trim().length > 0).toBeTruthy()
    }).toPass({ timeout: 15_000 })
  })
})
